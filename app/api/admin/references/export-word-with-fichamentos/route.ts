import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  generateReferencesWithFichamentosDocx,
  referencesWithFichamentosExportFilename,
  type WordExportReferenceWithFichamentos,
} from "@/lib/article-word-export";
import { verifySession } from "@/lib/auth";
import { getPool, hasDatabaseConfig } from "@/lib/db";
import { listPreviewFichamentoTopics } from "@/lib/fichamento-topic-store";
import { usesFileContentFallback } from "@/lib/preview-store";
import { listPreviewFichamentos } from "@/lib/reference-fichamento-store";
import { listPreviewReferences } from "@/lib/reference-store";
import {
  legacyReferenceHtml,
  sanitizeBibliographicReferenceHtml,
} from "@/lib/reference-html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function records(): Promise<WordExportReferenceWithFichamentos[]> {
  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    const [references, fichamentos, topics] = await Promise.all([
      listPreviewReferences(),
      listPreviewFichamentos(),
      listPreviewFichamentoTopics(),
    ]);
    const topicsById = new Map(topics.map((topic) => [topic.id, topic]));
    return references.map((reference) => ({
      id: reference.id,
      referenceText: reference.referenceText,
      referenceHtml: sanitizeBibliographicReferenceHtml(
        reference.referenceHtml || legacyReferenceHtml(reference.referenceText),
      ),
      fichamentos: fichamentos
        .filter((item) => item.referenceId === reference.id)
        .map((item) => ({
          literalQuote: item.literalQuote,
          paraphrase: item.paraphrase,
          location: item.location,
          personalNote: item.personalNote,
          topics: item.topicIds.map((id) => topicsById.get(id)).filter((topic) => topic !== undefined),
        })),
    }));
  }

  const [referencesResult, fichamentosResult] = await Promise.all([
    getPool().query(
      `SELECT id,
              reference_text AS "referenceText",
              COALESCE(reference_html, '') AS "referenceHtml"
       FROM bibliographic_references
       ORDER BY lower(reference_text)`,
    ),
    getPool().query(
      `SELECT rf.id,
              rf.reference_id AS "referenceId",
              rf.literal_quote AS "literalQuote",
              rf.paraphrase,
              rf.location,
              rf.personal_note AS "personalNote",
              COALESCE(
                jsonb_agg(
                  jsonb_build_object('id', rft.id, 'name', rft.name)
                  ORDER BY rftl.position
                ) FILTER (WHERE rft.id IS NOT NULL),
                '[]'::jsonb
              ) AS topics
       FROM reference_fichamentos rf
       LEFT JOIN reference_fichamento_topic_links rftl ON rftl.fichamento_id=rf.id
       LEFT JOIN reference_fichamento_topics rft ON rft.id=rftl.topic_id
       GROUP BY rf.id
       ORDER BY rf.updated_at DESC`,
    ),
  ]);
  return referencesResult.rows.map((reference) => ({
    ...reference,
    referenceHtml: sanitizeBibliographicReferenceHtml(
      reference.referenceHtml || legacyReferenceHtml(reference.referenceText),
    ),
    fichamentos: fichamentosResult.rows.filter((item) => item.referenceId === reference.id),
  }));
}

function siteOrigin(requestHeaders: Headers, requestUrl: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configured) return configured;
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") || new URL(requestUrl).protocol.replace(":", "") || "https";
  return host ? `${protocol}://${host}` : undefined;
}

export async function GET(request: Request) {
  const token = (await cookies()).get("academia_session")?.value;
  if (!(await verifySession(token))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const document = generateReferencesWithFichamentosDocx(
      await records(),
      siteOrigin(await headers(), request.url),
    );
    const filename = referencesWithFichamentosExportFilename();
    return new NextResponse(new Uint8Array(document), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("references_fichamentos_word_export_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível exportar as referências e os fichamentos." }, { status: 500 });
  }
}
