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
};

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

function withDuplicateWarnings(references: ReferenceRecord[]) {
  return references.map((reference) => ({
    ...reference,
    usageCount: reference.usages.length,
    possibleDuplicates: references
      .filter((candidate) => candidate.id !== reference.id)
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

async function previewRecords() {
  const [references, articles, fichamentos] = await Promise.all([
    listPreviewReferences(),
    listStoredArticles(),
    listPreviewFichamentos(),
  ]);
  return withDuplicateWarnings(references.map((reference) => ({
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
  })));
}

async function databaseRecords(): Promise<ReturnType<typeof withDuplicateWarnings>> {
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
            ) AS usages
     FROM bibliographic_references br
     LEFT JOIN article_footnote_references afr ON afr.reference_id=br.id
     LEFT JOIN articles a ON a.id=afr.article_id
     GROUP BY br.id
     ORDER BY lower(br.reference_text)`,
  );
  return withDuplicateWarnings(result.rows.map((reference) => ({
    ...reference,
    referenceHtml: reference.referenceHtml || legacyReferenceHtml(reference.referenceText),
  })));
}

async function listRecords() {
  return !hasDatabaseConfig() && usesFileContentFallback() ? previewRecords() : databaseRecords();
}

function matchesSearch(reference: ReferenceRecord, query: string) {
  if (!query) return true;
  return normalizeReferenceText(reference.referenceText).includes(normalizeReferenceText(query));
}

export async function GET(request: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const query = new URL(request.url).searchParams.get("q")?.trim() || "";
    const references = await listRecords();
    return NextResponse.json(references.filter((reference) => matchesSearch(reference, query)));
  } catch (error) {
    console.error("references_list_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível carregar as referências." }, { status: 503 });
  }
}

async function similarDatabaseReferences(referenceText: string, excludedId?: string) {
  const result = await getPool().query(
    "SELECT id,reference_text AS \"referenceText\",COALESCE(reference_html,'') AS \"referenceHtml\",normalized_text AS \"normalizedText\",updated_at::text AS \"updatedAt\" FROM bibliographic_references",
  );
  return result.rows
    .filter((reference) => reference.id !== excludedId)
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

  const records = await listRecords();
  const reference = records.find((item) => item.id === parsed.data.id);
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
