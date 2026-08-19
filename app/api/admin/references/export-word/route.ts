import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  generateReferencesDocx,
  referencesExportFilename,
  type WordExportReference,
} from "@/lib/article-word-export";
import { verifySession } from "@/lib/auth";
import { getPool, hasDatabaseConfig } from "@/lib/db";
import { listPreviewReferences } from "@/lib/reference-store";
import {
  legacyReferenceHtml,
  sanitizeBibliographicReferenceHtml,
} from "@/lib/reference-html";
import { usesFileContentFallback } from "@/lib/preview-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function references(): Promise<WordExportReference[]> {
  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    return (await listPreviewReferences()).map((reference) => ({
      id: reference.id,
      referenceText: reference.referenceText,
      referenceHtml: sanitizeBibliographicReferenceHtml(
        reference.referenceHtml || legacyReferenceHtml(reference.referenceText),
      ),
    }));
  }
  const result = await getPool().query(
    `SELECT id,
            reference_text AS "referenceText",
            COALESCE(reference_html, '') AS "referenceHtml"
     FROM bibliographic_references
     ORDER BY lower(reference_text)`,
  );
  return result.rows.map((reference) => ({
    ...reference,
    referenceHtml: sanitizeBibliographicReferenceHtml(
      reference.referenceHtml || legacyReferenceHtml(reference.referenceText),
    ),
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
  if (!verifySession(token)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const document = generateReferencesDocx(await references(), siteOrigin(await headers(), request.url));
    const filename = referencesExportFilename();
    return new NextResponse(new Uint8Array(document), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("references_word_export_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível exportar as referências para Word." }, { status: 500 });
  }
}
