import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { generateArticleDocx, wordExportFilename } from "@/lib/article-word-export";
import { findArticleForWordExport } from "@/lib/article-word-export-data";

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

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const token = (await cookies()).get("academia_session")?.value;
  if (!(await verifySession(token))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json({ error: "Artigo inválido" }, { status: 400 });
  }

  try {
    const article = await findArticleForWordExport(slug);
    if (!article) return NextResponse.json({ error: "Artigo não encontrado" }, { status: 404 });
    const document = await generateArticleDocx(article, siteOrigin(await headers(), request.url));
    const filename = wordExportFilename(article.title);
    return new NextResponse(new Uint8Array(document), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("article_word_export_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível exportar o artigo para Word." }, { status: 500 });
  }
}
