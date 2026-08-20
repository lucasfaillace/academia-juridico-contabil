import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { generateArticleDocx, wordExportFilename } from "@/lib/article-word-export";
import { listArticlesForWordExport } from "@/lib/article-word-export-data";
import { articleExportLimit } from "@/lib/export-limits";
import { createStreamingZip, type StreamingZipEntry } from "@/lib/streaming-zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function siteOrigin(requestHeaders: Headers, requestUrl: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configured) return configured;
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost || requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") || new URL(requestUrl).protocol.replace(":", "") || "https";
  return host ? `${protocol}://${host}` : undefined;
}

function uniqueFilename(filename: string, used: Set<string>) {
  if (!used.has(filename)) {
    used.add(filename);
    return filename;
  }
  const stem = filename.replace(/\.docx$/i, "");
  let suffix = 2;
  while (used.has(`${stem}-${suffix}.docx`)) suffix += 1;
  const unique = `${stem}-${suffix}.docx`;
  used.add(unique);
  return unique;
}

function articleArchiveEntries(
  articles: Awaited<ReturnType<typeof listArticlesForWordExport>>,
  origin: string | undefined,
  exportedAt: Date,
) {
  const usedFilenames = new Set<string>();
  return articles.map((article): StreamingZipEntry => ({
    filename: uniqueFilename(wordExportFilename(article.title, exportedAt), usedFilenames),
    data: async () => new Uint8Array(await generateArticleDocx(article, origin)),
  }));
}

export async function GET(request: Request) {
  const token = (await cookies()).get("academia_session")?.value;
  if (!(await verifySession(token))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const limit = articleExportLimit();
    const articles = await listArticlesForWordExport(undefined, limit + 1);
    if (!articles.length) return NextResponse.json({ error: "Nenhum artigo cadastrado." }, { status: 404 });
    if (articles.length > limit) {
      return NextResponse.json({
        error: `A exportação conjunta está limitada a ${limit} artigos. Exporte os artigos individualmente ou ajuste MAX_BULK_ARTICLE_EXPORT.`,
        code: "export_limit_exceeded",
        limit,
      }, { status: 413 });
    }

    const exportedAt = new Date();
    const origin = siteOrigin(await headers(), request.url);
    const filename = `artigos-academia-juridico-contabil-${exportedAt.toISOString().slice(0, 10)}.zip`;
    return new NextResponse(createStreamingZip(articleArchiveEntries(articles, origin, exportedAt)), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("all_articles_word_export_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível exportar todos os artigos." }, { status: 500 });
  }
}
