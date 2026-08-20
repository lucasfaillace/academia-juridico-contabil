import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getPool, hasDatabaseConfig } from "@/lib/db";
import { usesFileContentFallback } from "@/lib/preview-store";
import {
  createPreviewFichamento,
  deletePreviewFichamento,
  listPreviewFichamentos,
  updatePreviewFichamento,
} from "@/lib/reference-fichamento-store";
import { listPreviewReferences } from "@/lib/reference-store";
import { listPreviewFichamentoTopics } from "@/lib/fichamento-topic-store";
import { crossOriginMutationResponse } from "@/lib/request-security";
import { readJsonBody } from "@/lib/request-json";

const referenceIdSchema = z.string().uuid();
const entryFields = {
  referenceId: referenceIdSchema,
  literalQuote: z.string().trim().max(20_000).default(""),
  paraphrase: z.string().trim().max(20_000).default(""),
  location: z.string().trim().max(500).default(""),
  personalNote: z.string().trim().max(10_000).default(""),
  topicIds: z.array(z.string().uuid()).max(20).default([]),
  relatedFichamentoIds: z.array(z.string().uuid())
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length)
    .default([]),
};
const hasFichamentoContent = (entry: { literalQuote: string; paraphrase: string; personalNote: string }) =>
  Boolean(entry.literalQuote || entry.paraphrase || entry.personalNote);
const entrySchema = z.object(entryFields).refine(
  hasFichamentoContent,
  { message: "Informe uma citação literal, uma síntese ou paráfrase, ou uma observação pessoal." },
);
const updateSchema = z.object({ ...entryFields, id: z.string().uuid() }).refine(
  hasFichamentoContent,
  { message: "Informe uma citação literal, uma síntese ou paráfrase, ou uma observação pessoal." },
);
const deleteSchema = z.object({ id: z.string().uuid(), referenceId: referenceIdSchema });

async function authorized() {
  return verifySession((await cookies()).get("academia_session")?.value);
}

function usingPreviewStore() {
  return !hasDatabaseConfig() && usesFileContentFallback();
}

async function previewReferenceExists(referenceId: string) {
  return (await listPreviewReferences()).some((reference) => reference.id === referenceId);
}

async function previewTopics(topicIds: string[]) {
  const topics = await listPreviewFichamentoTopics();
  const selected = topicIds.map((id) => topics.find((topic) => topic.id === id)).filter(Boolean);
  return selected.length === topicIds.length ? selected : null;
}

async function databaseTopics(topicIds: string[]) {
  if (!topicIds.length) return [];
  const result = await getPool().query(
    `SELECT id,name,normalized_name AS "normalizedName"
     FROM reference_fichamento_topics
     WHERE id=ANY($1::uuid[])`,
    [topicIds],
  );
  if (result.rows.length !== topicIds.length) return null;
  const byId = new Map(result.rows.map((topic) => [topic.id, topic]));
  return topicIds.map((id) => byId.get(id));
}

type FichamentoItem = {
  id: string;
  referenceId: string;
  literalQuote: string;
  paraphrase: string;
  location: string;
  personalNote: string;
  relatedFichamentoIds?: string[];
  [key: string]: unknown;
};

function linkSummary(item: FichamentoItem, referenceText: string) {
  return {
    id: item.id,
    referenceId: item.referenceId,
    referenceText,
    literalQuote: item.literalQuote,
    paraphrase: item.paraphrase,
    location: item.location,
  };
}

async function decoratePreviewItems(items: FichamentoItem[]) {
  const [allItems, references] = await Promise.all([
    listPreviewFichamentos(),
    listPreviewReferences(),
  ]);
  const allById = new Map(allItems.map((item) => [item.id, item]));
  const referencesById = new Map(references.map((reference) => [reference.id, reference.referenceText]));
  return items.map((item) => ({
    ...item,
    relatedFichamentos: (item.relatedFichamentoIds || [])
      .map((id) => allById.get(id))
      .filter((target): target is NonNullable<typeof target> => Boolean(target))
      .map((target) => linkSummary(target, referencesById.get(target.referenceId) || "Referência")),
    backlinks: allItems
      .filter((source) => source.relatedFichamentoIds.includes(item.id))
      .map((source) => linkSummary(source, referencesById.get(source.referenceId) || "Referência")),
  }));
}

async function previewLinksExist(ids: string[], ownId?: string) {
  if (ownId && ids.includes(ownId)) return false;
  const allIds = new Set((await listPreviewFichamentos()).map((item) => item.id));
  return ids.every((id) => allIds.has(id));
}

async function databaseLinksExist(ids: string[], ownId?: string) {
  if (ownId && ids.includes(ownId)) return false;
  if (!ids.length) return true;
  const result = await getPool().query(
    "SELECT COUNT(*)::int AS count FROM reference_fichamentos WHERE id=ANY($1::uuid[])",
    [ids],
  );
  return result.rows[0].count === ids.length;
}

async function decorateDatabaseItems(items: FichamentoItem[]) {
  if (!items.length) return items.map((item) => ({ ...item, relatedFichamentos: [], backlinks: [] }));
  const ids = items.map((item) => item.id);
  const relations = await getPool().query(
    `SELECT l.source_fichamento_id AS "sourceId",
            l.target_fichamento_id AS "targetId",
            source.reference_id AS "sourceReferenceId",
            source.literal_quote AS "sourceLiteralQuote",
            source.paraphrase AS "sourceParaphrase",
            source.location AS "sourceLocation",
            source_reference.reference_text AS "sourceReferenceText",
            target.reference_id AS "targetReferenceId",
            target.literal_quote AS "targetLiteralQuote",
            target.paraphrase AS "targetParaphrase",
            target.location AS "targetLocation",
            target_reference.reference_text AS "targetReferenceText"
     FROM reference_fichamento_links l
     JOIN reference_fichamentos source ON source.id=l.source_fichamento_id
     JOIN bibliographic_references source_reference ON source_reference.id=source.reference_id
     JOIN reference_fichamentos target ON target.id=l.target_fichamento_id
     JOIN bibliographic_references target_reference ON target_reference.id=target.reference_id
     WHERE l.source_fichamento_id=ANY($1::uuid[]) OR l.target_fichamento_id=ANY($1::uuid[])`,
    [ids],
  );
  return items.map((item) => ({
    ...item,
    relatedFichamentos: relations.rows
      .filter((relation) => relation.sourceId === item.id)
      .map((relation) => ({
        id: relation.targetId,
        referenceId: relation.targetReferenceId,
        referenceText: relation.targetReferenceText,
        literalQuote: relation.targetLiteralQuote,
        paraphrase: relation.targetParaphrase,
        location: relation.targetLocation,
      })),
    backlinks: relations.rows
      .filter((relation) => relation.targetId === item.id)
      .map((relation) => ({
        id: relation.sourceId,
        referenceId: relation.sourceReferenceId,
        referenceText: relation.sourceReferenceText,
        literalQuote: relation.sourceLiteralQuote,
        paraphrase: relation.sourceParaphrase,
        location: relation.sourceLocation,
      })),
  }));
}

export async function GET(request: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const searchParams = new URL(request.url).searchParams;
  const all = searchParams.get("all") === "1";
  const parsed = referenceIdSchema.safeParse(searchParams.get("referenceId"));
  if (!all && !parsed.success) return NextResponse.json({ error: "Referência inválida." }, { status: 400 });

  try {
    if (usingPreviewStore()) {
      const [items, topics] = await Promise.all([
        listPreviewFichamentos(all ? undefined : parsed.data),
        listPreviewFichamentoTopics(),
      ]);
      const topicsById = new Map(topics.map((topic) => [topic.id, topic]));
      return NextResponse.json(await decoratePreviewItems(items.map((item) => ({
        ...item,
        topics: item.topicIds.map((id) => topicsById.get(id)).filter(Boolean),
      }))));
    }
    const result = await getPool().query(
      `SELECT id,
              reference_id AS "referenceId",
              literal_quote AS "literalQuote",
              paraphrase,
              location,
              personal_note AS "personalNote",
              created_at::text AS "createdAt",
              updated_at::text AS "updatedAt",
              COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'id', rft.id,
                    'name', rft.name,
                    'normalizedName', rft.normalized_name
                  )
                  ORDER BY rftl.position
                ) FILTER (WHERE rft.id IS NOT NULL),
                '[]'::jsonb
              ) AS topics
       FROM reference_fichamentos rf
       LEFT JOIN reference_fichamento_topic_links rftl ON rftl.fichamento_id=rf.id
       LEFT JOIN reference_fichamento_topics rft ON rft.id=rftl.topic_id
       WHERE ($1::uuid IS NULL OR rf.reference_id=$1)
       GROUP BY rf.id
       ORDER BY rf.updated_at DESC`,
      [all ? null : parsed.data],
    );
    return NextResponse.json(await decorateDatabaseItems(result.rows));
  } catch (error) {
    console.error("reference_fichamentos_list_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível carregar o fichamento." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = entrySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Revise o conteúdo do fichamento." }, { status: 400 });

  try {
    if (usingPreviewStore()) {
      if (!(await previewReferenceExists(parsed.data.referenceId))) {
        return NextResponse.json({ error: "Referência não encontrada." }, { status: 404 });
      }
      const topics = await previewTopics(parsed.data.topicIds);
      if (!topics) return NextResponse.json({ error: "Um dos temas selecionados não foi encontrado." }, { status: 400 });
      if (!(await previewLinksExist(parsed.data.relatedFichamentoIds))) {
        return NextResponse.json({ error: "Uma das remissões selecionadas não foi encontrada." }, { status: 400 });
      }
      const item = await createPreviewFichamento(parsed.data);
      return NextResponse.json((await decoratePreviewItems([{ ...item, topics }]))[0], { status: 201 });
    }
    const topics = await databaseTopics(parsed.data.topicIds);
    if (!topics) return NextResponse.json({ error: "Um dos temas selecionados não foi encontrado." }, { status: 400 });
    if (!(await databaseLinksExist(parsed.data.relatedFichamentoIds))) {
      return NextResponse.json({ error: "Uma das remissões selecionadas não foi encontrada." }, { status: 400 });
    }
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO reference_fichamentos(reference_id,literal_quote,paraphrase,location,personal_note)
         VALUES($1,$2,$3,$4,$5)
         RETURNING id,
                   reference_id AS "referenceId",
                   literal_quote AS "literalQuote",
                   paraphrase,
                   location,
                   personal_note AS "personalNote",
                   created_at::text AS "createdAt",
                   updated_at::text AS "updatedAt"`,
        [parsed.data.referenceId, parsed.data.literalQuote, parsed.data.paraphrase, parsed.data.location, parsed.data.personalNote],
      );
      for (const [position, topicId] of parsed.data.topicIds.entries()) {
        await client.query(
          "INSERT INTO reference_fichamento_topic_links(fichamento_id,topic_id,position) VALUES($1,$2,$3)",
          [result.rows[0].id, topicId, position],
        );
      }
      for (const targetId of parsed.data.relatedFichamentoIds) {
        await client.query(
          "INSERT INTO reference_fichamento_links(source_fichamento_id,target_fichamento_id) VALUES($1,$2)",
          [result.rows[0].id, targetId],
        );
      }
      await client.query("COMMIT");
      return NextResponse.json((await decorateDatabaseItems([{ ...result.rows[0], topics }]))[0], { status: 201 });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch {
    return NextResponse.json({ error: "Não foi possível criar o registro do fichamento." }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = updateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Revise o conteúdo do fichamento." }, { status: 400 });

  try {
    if (usingPreviewStore()) {
      const topics = await previewTopics(parsed.data.topicIds);
      if (!topics) return NextResponse.json({ error: "Um dos temas selecionados não foi encontrado." }, { status: 400 });
      if (!(await previewLinksExist(parsed.data.relatedFichamentoIds, parsed.data.id))) {
        return NextResponse.json({ error: "Uma das remissões selecionadas não foi encontrada." }, { status: 400 });
      }
      return NextResponse.json((await decoratePreviewItems([{ ...await updatePreviewFichamento(parsed.data), topics }]))[0]);
    }
    const topics = await databaseTopics(parsed.data.topicIds);
    if (!topics) return NextResponse.json({ error: "Um dos temas selecionados não foi encontrado." }, { status: 400 });
    if (!(await databaseLinksExist(parsed.data.relatedFichamentoIds, parsed.data.id))) {
      return NextResponse.json({ error: "Uma das remissões selecionadas não foi encontrada." }, { status: 400 });
    }
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE reference_fichamentos
         SET literal_quote=$1,paraphrase=$2,location=$3,personal_note=$4,updated_at=NOW()
         WHERE id=$5 AND reference_id=$6
         RETURNING id,
                   reference_id AS "referenceId",
                   literal_quote AS "literalQuote",
                   paraphrase,
                   location,
                   personal_note AS "personalNote",
                   created_at::text AS "createdAt",
                   updated_at::text AS "updatedAt"`,
        [
          parsed.data.literalQuote,
          parsed.data.paraphrase,
          parsed.data.location,
          parsed.data.personalNote,
          parsed.data.id,
          parsed.data.referenceId,
        ],
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Registro do fichamento não encontrado." }, { status: 404 });
      }
      await client.query("DELETE FROM reference_fichamento_topic_links WHERE fichamento_id=$1", [parsed.data.id]);
      for (const [position, topicId] of parsed.data.topicIds.entries()) {
        await client.query(
          "INSERT INTO reference_fichamento_topic_links(fichamento_id,topic_id,position) VALUES($1,$2,$3)",
          [parsed.data.id, topicId, position],
        );
      }
      await client.query("DELETE FROM reference_fichamento_links WHERE source_fichamento_id=$1", [parsed.data.id]);
      for (const targetId of parsed.data.relatedFichamentoIds) {
        await client.query(
          "INSERT INTO reference_fichamento_links(source_fichamento_id,target_fichamento_id) VALUES($1,$2)",
          [parsed.data.id, targetId],
        );
      }
      await client.query("COMMIT");
      return NextResponse.json((await decorateDatabaseItems([{ ...result.rows[0], topics }]))[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar o fichamento." }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Registro do fichamento inválido." }, { status: 400 });

  if (usingPreviewStore()) {
    try {
      await deletePreviewFichamento(parsed.data.id, parsed.data.referenceId);
      return NextResponse.json({ deleted: true });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Registro não encontrado." }, { status: 404 });
    }
  }

  const result = await getPool().query(
    "DELETE FROM reference_fichamentos WHERE id=$1 AND reference_id=$2 RETURNING id",
    [parsed.data.id, parsed.data.referenceId],
  );
  if (!result.rowCount) return NextResponse.json({ error: "Registro do fichamento não encontrado." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
