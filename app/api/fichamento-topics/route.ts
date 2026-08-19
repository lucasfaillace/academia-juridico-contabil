import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getPool, hasDatabaseConfig } from "@/lib/db";
import {
  createPreviewFichamentoTopic,
  deletePreviewFichamentoTopic,
  listPreviewFichamentoTopics,
  normalizeFichamentoTopic,
  updatePreviewFichamentoTopic,
} from "@/lib/fichamento-topic-store";
import { usesFileContentFallback } from "@/lib/preview-store";
import { listPreviewFichamentos, unlinkPreviewFichamentoTopic } from "@/lib/reference-fichamento-store";
import { listPreviewReferences } from "@/lib/reference-store";
import { crossOriginMutationResponse } from "@/lib/request-security";

const topicSchema = z.object({ name: z.string().trim().min(2).max(120) });
const updateTopicSchema = topicSchema.extend({ id: z.string().uuid() });
const deleteTopicSchema = z.object({ id: z.string().uuid() });

async function authorized() {
  return verifySession((await cookies()).get("academia_session")?.value);
}

function usingPreviewStore() {
  return !hasDatabaseConfig() && usesFileContentFallback();
}

export async function GET() {
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    if (usingPreviewStore()) {
      const [topics, fichamentos, references] = await Promise.all([
        listPreviewFichamentoTopics(),
        listPreviewFichamentos(),
        listPreviewReferences(),
      ]);
      const validReferenceIds = new Set(references.map((reference) => reference.id));
      const visibleFichamentos = fichamentos.filter((item) => validReferenceIds.has(item.referenceId));
      return NextResponse.json(topics.map((topic) => ({
        ...topic,
        usageCount: visibleFichamentos.filter((item) => item.topicIds.includes(topic.id)).length,
      })));
    }
    const result = await getPool().query(
      `SELECT rt.id,
              rt.name,
              rt.normalized_name AS "normalizedName",
              COUNT(rftl.fichamento_id)::int AS "usageCount"
       FROM reference_fichamento_topics rt
       LEFT JOIN reference_fichamento_topic_links rftl ON rftl.topic_id=rt.id
       GROUP BY rt.id
       ORDER BY lower(rt.name)`,
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("fichamento_topics_list_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível carregar os temas." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = updateTopicSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe um nome válido para o tema." }, { status: 400 });

  try {
    if (usingPreviewStore()) {
      return NextResponse.json(await updatePreviewFichamentoTopic(parsed.data.id, parsed.data.name));
    }
    const result = await getPool().query(
      `UPDATE reference_fichamento_topics
       SET name=$2,normalized_name=$3,updated_at=now()
       WHERE id=$1
       RETURNING id,name,normalized_name AS "normalizedName"`,
      [parsed.data.id, parsed.data.name, normalizeFichamentoTopic(parsed.data.name)],
    );
    if (!result.rowCount) return NextResponse.json({ error: "Tema não encontrado." }, { status: 404 });
    return NextResponse.json(result.rows[0]);
  } catch {
    return NextResponse.json({ error: "Já existe um tema com esse nome." }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = deleteTopicSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Tema inválido." }, { status: 400 });

  try {
    if (usingPreviewStore()) {
      const usages = (await listPreviewFichamentos()).filter((item) => item.topicIds.includes(parsed.data.id));
      await unlinkPreviewFichamentoTopic(parsed.data.id);
      await deletePreviewFichamentoTopic(parsed.data.id);
      return NextResponse.json({ ok: true, removedUsageCount: usages.length });
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const usage = await client.query(
        "DELETE FROM reference_fichamento_topic_links WHERE topic_id=$1 RETURNING fichamento_id",
        [parsed.data.id],
      );
      const result = await client.query("DELETE FROM reference_fichamento_topics WHERE id=$1", [parsed.data.id]);
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Tema não encontrado." }, { status: 404 });
      }
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, removedUsageCount: usage.rowCount || 0 });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch {
    return NextResponse.json({ error: "Não foi possível excluir o tema." }, { status: 409 });
  }
}

export async function POST(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = topicSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe um tema com pelo menos dois caracteres." }, { status: 400 });

  try {
    if (usingPreviewStore()) return NextResponse.json(await createPreviewFichamentoTopic(parsed.data.name), { status: 201 });
    const result = await getPool().query(
      `INSERT INTO reference_fichamento_topics(name,normalized_name)
       VALUES($1,$2)
       ON CONFLICT(normalized_name)
       DO UPDATE SET name=reference_fichamento_topics.name
       RETURNING id,name,normalized_name AS "normalizedName"`,
      [parsed.data.name, normalizeFichamentoTopic(parsed.data.name)],
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch {
    return NextResponse.json({ error: "Não foi possível criar o tema." }, { status: 409 });
  }
}
