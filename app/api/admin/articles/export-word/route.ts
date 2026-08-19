import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { zipSync } from "fflate";
import { verifySession } from "@/lib/auth";
import { generateArticleDocx, wordExportFilename } from "@/lib/article-word-export";
import { listArticlesForWordExport } from "@/lib/article-word-export-data";

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

export async function GET(request: Request) {
  const token = (await cookies()).get("academia_session")?.value;
  if (!verifySession(token)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const articles = await listArticlesForWordExport();
    if (!articles.length) return NextResponse.json({ error: "Nenhum artigo cadastrado." }, { status: 404 });

    const exportedAt = new Date();
    const origin = siteOrigin(await headers(), request.url);
    const files: Record<string, Uint8Array> = {};
    const usedFilenames = new Set<string>();
    for (const article of articles) {
      const filename = uniqueFilename(wordExportFilename(article.title, exportedAt), usedFilenames);
      files[filename] = new Uint8Array(await generateArticleDocx(article, origin));
    }
    const archive = zipSync(files, { level: 6 });
    const filename = `artigos-academia-juridico-contabil-${exportedAt.toISOString().slice(0, 10)}.zip`;
    return new NextResponse(new Uint8Array(archive), {
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
