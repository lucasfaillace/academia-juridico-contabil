import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { extractFootnoteReferenceLinks, normalizeReferenceText, referenceSimilarity } from "@/lib/bibliographic-references";
import { getPool, hasDatabaseConfig } from "@/lib/db";
import { listStoredArticles, usesFileContentFallback } from "@/lib/preview-store";
import {
  legacyReferenceHtml,
  referenceTextFromHtml,
  sanitizeBibliographicReferenceHtml,
} from "@/lib/reference-html";
import {
  createPreviewReference,
  deletePreviewReference,
  listPreviewReferences,
  similarPreviewReferences,
  updatePreviewReference,
  type StoredBibliographicReference,
} from "@/lib/reference-store";
import { listPreviewFichamentos } from "@/lib/reference-fichamento-store";
import { crossOriginMutationResponse } from "@/lib/request-security";
import { readJsonBody } from "@/lib/request-json";
import { purgeOptionalCloudflareCache } from "@/lib/cloudflare-cache";
import { referenceListParameters } from "@/lib/reference-query";

const referenceSchema = z.object({
  referenceHtml: z.string().trim().min(1).max(40_000).optional(),
  referenceText: z.string().trim().min(1).max(5000).optional(),
  confirmSimilar: z.boolean().default(false),
}).refine((value) => Boolean(value.referenceHtml || value.referenceText));
const updateSchema = referenceSchema.safeExtend({ id: z.string().uuid() });
const deleteSchema = z.object({ id: z.string().uuid() });

type ReferenceUsage = {
  articleSlug: string;
  articleTitle: string;
  footnoteId: string;
  noteNumber: number;
  citationDetails: string;
  occurrenceIndex: number;
};

type ReferenceRecord = {
  id: string;
  referenceText: string;
  referenceHtml: string;
  normalizedText: string;
  updatedAt: string;
  usages: ReferenceUsage[];
  fichamentoCount: number;
  fichamentoTopicSets: string[][];
  fichamentoSearchText: string;
  duplicateCandidates?: DuplicateCandidate[];
};

type ReferenceSummary = Omit<ReferenceRecord, "usages" | "fichamentoTopicSets" | "fichamentoSearchText" | "duplicateCandidates"> & {
  usageCount: number;
  possibleDuplicates: Array<DuplicateCandidate & { similarity: number }>;
};

type DuplicateCandidate = Pick<ReferenceRecord, "id" | "referenceText" | "referenceHtml">;

async function authorized() {
  return verifySession((await cookies()).get("academia_session")?.value);
}

function previewUsages(id: string, articles: Awaited<ReturnType<typeof listStoredArticles>>): ReferenceUsage[] {
  return articles.flatMap((article) =>
    extractFootnoteReferenceLinks(article.content_html)
      .filter((link) => link.referenceId === id)
      .map((link) => ({
        articleSlug: article.slug,
        articleTitle: article.title,
        footnoteId: link.footnoteId,
        noteNumber: link.noteNumber,
        citationDetails: link.citationDetails,
        occurrenceIndex: link.occurrenceIndex,
      })),
  );
}

function candidateTrigrams(value: string) {
  const normalized = ` ${normalizeReferenceText(value)} `;
  const trigrams = new Set<string>();
  for (let index = 0; index < normalized.length - 2; index += 1) {
    trigrams.add(normalized.slice(index, index + 3));
  }
  return trigrams;
}

function previewDuplicateCandidates(references: ReferenceRecord[]) {
  const trigramsById = new Map(references.map((reference) => [reference.id, candidateTrigrams(reference.referenceText)]));
  const referencesById = new Map(references.map((reference) => [reference.id, reference]));
  const postings = new Map<string, string[]>();
  for (const [id, trigrams] of trigramsById) {
    for (const trigram of trigrams) {
      const posting = postings.get(trigram);
      if (posting) posting.push(id);
      else postings.set(trigram, [id]);
    }
  }

  return new Map(references.map((reference) => {
    const scores = new Map<string, number>();
    const selectiveTrigrams = Array.from(trigramsById.get(reference.id) || [])
      .sort((left, right) => (postings.get(left)?.length || 0) - (postings.get(right)?.length || 0))
      .slice(0, 16);
    for (const trigram of selectiveTrigrams) {
      for (const candidateId of postings.get(trigram) || []) {
        if (candidateId !== reference.id) scores.set(candidateId, (scores.get(candidateId) || 0) + 1);
      }
    }
    const candidates = Array.from(scores)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 24)
      .flatMap(([id]) => {
        const candidate = referencesById.get(id);
        return candidate ? [{ id: candidate.id, referenceText: candidate.referenceText, referenceHtml: candidate.referenceHtml }] : [];
      });
    return [reference.id, candidates] as const;
  }));
}

function withDuplicateWarnings(references: ReferenceRecord[]) {
  const fallbackCandidates = references.some((reference) => reference.duplicateCandidates === undefined)
    ? previewDuplicateCandidates(references)
    : new Map<string, DuplicateCandidate[]>();
  return references.map(({ duplicateCandidates, ...reference }) => ({
    ...reference,
    usageCount: reference.usages.length,
    possibleDuplicates: (duplicateCandidates || fallbackCandidates.get(reference.id) || [])
      .map((candidate) => ({
        id: candidate.id,
        referenceText: candidate.referenceText,
        referenceHtml: candidate.referenceHtml,
        similarity: referenceSimilarity(reference.referenceText, candidate.referenceText),
      }))
      .filter((candidate) => candidate.similarity >= 0.72)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3),
  }));
}

function duplicateWarnings(reference: Pick<ReferenceRecord, "referenceText">, candidates: DuplicateCandidate[]) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      similarity: referenceSimilarity(reference.referenceText, candidate.referenceText),
    }))
    .filter((candidate) => candidate.similarity >= 0.72)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 3);
}

async function previewRecord(id: string) {
  const [references, articles, fichamentos] = await Promise.all([
    listPreviewReferences(),
    listStoredArticles(),
    listPreviewFichamentos(),
  ]);
  const records = withDuplicateWarnings(references.filter((reference) => reference.id === id).map((reference) => ({
    id: reference.id,
    referenceText: reference.referenceText,
    referenceHtml: reference.referenceHtml || legacyReferenceHtml(reference.referenceText),
    normalizedText: reference.normalizedText,
    updatedAt: reference.updatedAt,
    usages: previewUsages(reference.id, articles),
    fichamentoCount: fichamentos.filter((item) => item.referenceId === reference.id).length,
    fichamentoTopicSets: fichamentos
      .filter((item) => item.referenceId === reference.id)
      .map((item) => item.topicIds),
    fichamentoSearchText: fichamentos
      .filter((item) => item.referenceId === reference.id)
      .map((item) => `${item.literalQuote} ${item.paraphrase} ${item.location} ${item.personalNote}`)
      .join(" "),
    duplicateCandidates: similarPreviewReferences(reference.referenceText, references, reference.id),
  })));
  return records[0] || null;
}

async function databaseRecord(id: string) {
  const result = await getPool().query(
    `SELECT br.id,
            br.reference_text AS "referenceText",
            COALESCE(br.reference_html, '') AS "referenceHtml",
            br.normalized_text AS "normalizedText",
            br.updated_at::text AS "updatedAt",
            (SELECT COUNT(*)::int
             FROM reference_fichamentos rf
             WHERE rf.reference_id=br.id) AS "fichamentoCount",
            (SELECT COALESCE(
               string_agg(concat_ws(' ', rf.literal_quote, rf.paraphrase, rf.location, rf.personal_note), ' '),
               ''
             )
             FROM reference_fichamentos rf
             WHERE rf.reference_id=br.id) AS "fichamentoSearchText",
            (SELECT COALESCE(jsonb_agg(topic_set.topic_ids), '[]'::jsonb)
             FROM (
               SELECT COALESCE(
                 jsonb_agg(rftl.topic_id ORDER BY rftl.position)
                   FILTER (WHERE rftl.topic_id IS NOT NULL),
                 '[]'::jsonb
               ) AS topic_ids
               FROM reference_fichamentos rf
               LEFT JOIN reference_fichamento_topic_links rftl ON rftl.fichamento_id=rf.id
               WHERE rf.reference_id=br.id
               GROUP BY rf.id
             ) topic_set) AS "fichamentoTopicSets",
            COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'articleSlug', a.slug,
                  'articleTitle', a.title,
                  'footnoteId', afr.footnote_id,
                  'noteNumber', afr.note_number,
                  'citationDetails', afr.citation_details,
                  'occurrenceIndex', afr.occurrence_index
                )
                ORDER BY lower(a.title), afr.note_number, afr.occurrence_index
              ) FILTER (WHERE afr.article_id IS NOT NULL),
              '[]'::jsonb
            ) AS usages,
            COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', candidate.id,
                  'referenceText', candidate.reference_text,
                  'referenceHtml', COALESCE(candidate.reference_html, '')
                )
                ORDER BY candidate.trigram_similarity DESC
              )
              FROM (
                SELECT other.id,
                       other.reference_text,
                       other.reference_html,
                       similarity(other.normalized_text, br.normalized_text) AS trigram_similarity
                FROM bibliographic_references other
                WHERE other.id <> br.id
                  AND other.normalized_text % br.normalized_text
                ORDER BY trigram_similarity DESC
                LIMIT 24
              ) candidate
            ), '[]'::jsonb) AS "duplicateCandidates"
     FROM bibliographic_references br
     LEFT JOIN article_footnote_references afr ON afr.reference_id=br.id
     LEFT JOIN articles a ON a.id=afr.article_id
     WHERE br.id=$1
     GROUP BY br.id
     LIMIT 1`,
    [id],
  );
  const records = withDuplicateWarnings(result.rows.map((reference) => ({
    ...reference,
    referenceHtml: reference.referenceHtml || legacyReferenceHtml(reference.referenceText),
  })));
  return records[0] || null;
}

async function recordDetail(id: string) {
  return !hasDatabaseConfig() && usesFileContentFallback() ? previewRecord(id) : databaseRecord(id);
}

type ReferenceFilters = ReturnType<typeof referenceListParameters>;

async function previewReferencePage(filters: ReferenceFilters) {
  const [storedReferences, articles, fichamentos] = await Promise.all([
    listPreviewReferences(),
    listStoredArticles(),
    listPreviewFichamentos(),
  ]);
  const query = normalizeReferenceText(filters.query);
  const fichamentoQuery = normalizeReferenceText(filters.fichamentoQuery);
  const selectedIds = new Set(filters.ids);
  const filtered = storedReferences.filter((reference) => {
    const linkedFichamentos = fichamentos.filter((item) => item.referenceId === reference.id);
    const matchesReference = !query || reference.normalizedText.includes(query);
    const matchesFichamento = !fichamentoQuery || linkedFichamentos.some((item) => normalizeReferenceText(
      `${item.literalQuote} ${item.paraphrase} ${item.location} ${item.personalNote}`,
    ).includes(fichamentoQuery));
    const matchesTopics = !filters.topicIds.length || linkedFichamentos.some((item) =>
      filters.topicIds.every((topicId) => item.topicIds.includes(topicId)),
    );
    return (!selectedIds.size || selectedIds.has(reference.id)) && matchesReference && matchesFichamento && matchesTopics;
  }).sort((left, right) => left.referenceText.localeCompare(right.referenceText, "pt-BR"));
  const pageSize = selectedIds.size ? 100 : filters.pageSize;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = selectedIds.size ? 1 : Math.min(filters.page, pageCount);
  const start = (page - 1) * pageSize;
  const items: ReferenceSummary[] = filtered.slice(start, start + pageSize).map((reference) => {
    const linkedFichamentos = fichamentos.filter((item) => item.referenceId === reference.id);
    return {
      id: reference.id,
      referenceText: reference.referenceText,
      referenceHtml: reference.referenceHtml || legacyReferenceHtml(reference.referenceText),
      normalizedText: reference.normalizedText,
      updatedAt: reference.updatedAt,
      usageCount: previewUsages(reference.id, articles).length,
      fichamentoCount: linkedFichamentos.length,
      possibleDuplicates: duplicateWarnings(
        reference,
        similarPreviewReferences(reference.referenceText, storedReferences, reference.id),
      ),
    };
  });
  return { items, total: filtered.length, page, pageSize, pageCount };
}

function databaseFilterSql() {
  return `($1::text = '' OR br.normalized_text ILIKE '%' || $1 || '%')
    AND ($2::text = '' OR EXISTS (
      SELECT 1
      FROM reference_fichamentos rf_search
      WHERE rf_search.reference_id=br.id
        AND lower(rf_search.literal_quote || ' ' || rf_search.paraphrase || ' ' || rf_search.location || ' ' || rf_search.personal_note)
          LIKE '%' || lower($2) || '%'
    ))
    AND (cardinality($3::uuid[]) = 0 OR EXISTS (
      SELECT 1
      FROM reference_fichamentos rf_topic
      WHERE rf_topic.reference_id=br.id
        AND NOT EXISTS (
          SELECT 1
          FROM unnest($3::uuid[]) selected_topic(id)
          WHERE NOT EXISTS (
            SELECT 1
            FROM reference_fichamento_topic_links topic_link
            WHERE topic_link.fichamento_id=rf_topic.id
              AND topic_link.topic_id=selected_topic.id
          )
        )
    ))
    AND (cardinality($4::uuid[]) = 0 OR br.id=ANY($4::uuid[]))`;
}

async function databaseReferencePage(filters: ReferenceFilters) {
  const normalizedQuery = normalizeReferenceText(filters.query);
  const pageSize = filters.ids.length ? 100 : filters.pageSize;
  const requestedPage = filters.ids.length ? 1 : filters.page;
  const values = [normalizedQuery, filters.fichamentoQuery, filters.topicIds, filters.ids];
  const where = databaseFilterSql();
  const countResult = await getPool().query(
    `SELECT COUNT(*)::int AS total FROM bibliographic_references br WHERE ${where}`,
    values,
  );
  const total = Number(countResult.rows[0]?.total || 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const result = await getPool().query(
    `SELECT br.id,
            br.reference_text AS "referenceText",
            COALESCE(br.reference_html, '') AS "referenceHtml",
            br.normalized_text AS "normalizedText",
            br.updated_at::text AS "updatedAt",
            (SELECT COUNT(*)::int
             FROM article_footnote_references afr
             WHERE afr.reference_id=br.id) AS "usageCount",
            (SELECT COUNT(*)::int
             FROM reference_fichamentos rf
             WHERE rf.reference_id=br.id) AS "fichamentoCount",
            COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', candidate.id,
                  'referenceText', candidate.reference_text,
                  'referenceHtml', COALESCE(candidate.reference_html, '')
                )
                ORDER BY candidate.trigram_similarity DESC
              )
              FROM (
                SELECT other.id,
                       other.reference_text,
                       other.reference_html,
                       similarity(other.normalized_text, br.normalized_text) AS trigram_similarity
                FROM bibliographic_references other
                WHERE other.id <> br.id
                  AND other.normalized_text % br.normalized_text
                ORDER BY trigram_similarity DESC
                LIMIT 24
              ) candidate
            ), '[]'::jsonb) AS "duplicateCandidates"
     FROM bibliographic_references br
     WHERE ${where}
     ORDER BY lower(br.reference_text), br.id
     LIMIT $5 OFFSET $6`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  const items: ReferenceSummary[] = result.rows.map((reference) => ({
    ...reference,
    referenceHtml: reference.referenceHtml || legacyReferenceHtml(reference.referenceText),
    usageCount: Number(reference.usageCount),
    fichamentoCount: Number(reference.fichamentoCount),
    possibleDuplicates: duplicateWarnings(reference, reference.duplicateCandidates || []),
  }));
  return { items, total, page, pageSize, pageCount };
}

async function listReferencePage(filters: ReferenceFilters) {
  return !hasDatabaseConfig() && usesFileContentFallback()
    ? previewReferencePage(filters)
    : databaseReferencePage(filters);
}

export async function GET(request: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const filters = referenceListParameters(request.url);
    if (filters.detailId) {
      const detail = await recordDetail(filters.detailId);
      return detail
        ? NextResponse.json(detail, { headers: { "cache-control": "private, no-store, max-age=0" } })
        : NextResponse.json({ error: "Referência não encontrada." }, { status: 404 });
    }
    return NextResponse.json(await listReferencePage(filters), {
      headers: { "cache-control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    console.error("references_list_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível carregar as referências." }, { status: 503 });
  }
}

async function similarDatabaseReferences(referenceText: string, excludedId?: string) {
  const normalizedText = normalizeReferenceText(referenceText);
  const result = await getPool().query(
    `SELECT id,
            reference_text AS "referenceText",
            COALESCE(reference_html,'') AS "referenceHtml",
            normalized_text AS "normalizedText",
            updated_at::text AS "updatedAt"
     FROM bibliographic_references
     WHERE ($2::uuid IS NULL OR id <> $2)
       AND normalized_text % $1
     ORDER BY similarity(normalized_text, $1) DESC
     LIMIT 24`,
    [normalizedText, excludedId || null],
  );
  return result.rows
    .map((reference) => ({ ...reference, similarity: referenceSimilarity(referenceText, reference.referenceText) }))
    .filter((reference) => reference.similarity >= 0.72)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
}

function similarResponse(similar: Array<StoredBibliographicReference & { similarity: number }>) {
  return NextResponse.json({
    error: "Encontramos referências muito semelhantes. Revise antes de criar uma nova.",
    code: "similar_reference",
    similarReferences: similar.map(({ id, referenceText, referenceHtml, similarity }) => ({
      id,
      referenceText,
      referenceHtml: referenceHtml || legacyReferenceHtml(referenceText),
      similarity,
    })),
  }, { status: 409 });
}

function parsedReference(input: z.infer<typeof referenceSchema>) {
  const source = input.referenceHtml || legacyReferenceHtml(input.referenceText || "");
  const referenceHtml = sanitizeBibliographicReferenceHtml(source);
  const referenceText = referenceTextFromHtml(referenceHtml);
  if (referenceText.length < 10 || referenceText.length > 5000) return null;
  return { referenceHtml, referenceText };
}

async function revalidateReferencePages() {
  revalidatePath("/blog");
  revalidatePath("/blog/[slug]", "page");
  await purgeOptionalCloudflareCache({ paths: ["/blog"], prefixes: ["/blog/"] });
}

export async function POST(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = referenceSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Informe a referência bibliográfica completa." }, { status: 400 });
  const reference = parsedReference(parsed.data);
  if (!reference) return NextResponse.json({ error: "Informe a referência bibliográfica completa." }, { status: 400 });

  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    try {
      const references = await listPreviewReferences();
      const similar = similarPreviewReferences(reference.referenceText, references);
      if (similar.length && !parsed.data.confirmSimilar) return similarResponse(similar);
      return NextResponse.json(await createPreviewReference(reference.referenceText, reference.referenceHtml), { status: 201 });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível criar a referência." }, { status: 409 });
    }
  }

  try {
    const similar = await similarDatabaseReferences(reference.referenceText);
    if (similar.length && !parsed.data.confirmSimilar) return similarResponse(similar);
    const result = await getPool().query(
      `INSERT INTO bibliographic_references(reference_text,reference_html,normalized_text)
       VALUES($1,$2,$3)
       RETURNING id,reference_text AS "referenceText",reference_html AS "referenceHtml",normalized_text AS "normalizedText",updated_at::text AS "updatedAt"`,
      [reference.referenceText, reference.referenceHtml, normalizeReferenceText(reference.referenceText)],
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch {
    return NextResponse.json({ error: "Esta referência já está cadastrada." }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = updateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Dados da referência inválidos." }, { status: 400 });
  const reference = parsedReference(parsed.data);
  if (!reference) return NextResponse.json({ error: "Informe a referência bibliográfica completa." }, { status: 400 });

  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    try {
      const references = await listPreviewReferences();
      const similar = similarPreviewReferences(reference.referenceText, references, parsed.data.id);
      if (similar.length && !parsed.data.confirmSimilar) return similarResponse(similar);
      const updated = await updatePreviewReference(parsed.data.id, reference.referenceText, reference.referenceHtml);
      await revalidateReferencePages();
      return NextResponse.json(updated);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a referência." }, { status: 409 });
    }
  }

  try {
    const similar = await similarDatabaseReferences(reference.referenceText, parsed.data.id);
    if (similar.length && !parsed.data.confirmSimilar) return similarResponse(similar);
    const result = await getPool().query(
      `UPDATE bibliographic_references
       SET reference_text=$1,reference_html=$2,normalized_text=$3,updated_at=NOW()
       WHERE id=$4
       RETURNING id,reference_text AS "referenceText",reference_html AS "referenceHtml",normalized_text AS "normalizedText",updated_at::text AS "updatedAt"`,
      [reference.referenceText, reference.referenceHtml, normalizeReferenceText(reference.referenceText), parsed.data.id],
    );
    if (!result.rowCount) return NextResponse.json({ error: "Referência não encontrada." }, { status: 404 });
    await revalidateReferencePages();
    return NextResponse.json(result.rows[0]);
  } catch {
    return NextResponse.json({ error: "Esta referência já está cadastrada." }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Referência inválida." }, { status: 400 });

  const reference = await recordDetail(parsed.data.id);
  if (!reference) return NextResponse.json({ error: "Referência não encontrada." }, { status: 404 });
  if (reference.usages.length) {
    return NextResponse.json({
      error: "Esta referência está em uso e não pode ser excluída.",
      code: "reference_in_use",
      usages: reference.usages,
    }, { status: 409 });
  }
  if (reference.fichamentoCount) {
    return NextResponse.json({
      error: "Esta referência possui fichamento e não pode ser excluída.",
      code: "reference_has_fichamento",
      fichamentoCount: reference.fichamentoCount,
    }, { status: 409 });
  }

  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    await deletePreviewReference(parsed.data.id);
    return NextResponse.json({ deleted: true });
  }

  const result = await getPool().query("DELETE FROM bibliographic_references WHERE id=$1 RETURNING id", [parsed.data.id]);
  if (!result.rowCount) return NextResponse.json({ error: "Referência não encontrada." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
