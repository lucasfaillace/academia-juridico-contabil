import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sanitizeArticleContent } from "@/lib/article-content-security";
import { verifySession } from "@/lib/auth";
import { extractFootnoteReferenceLinks } from "@/lib/bibliographic-references";
import { formatAuthorNames, type Article, type ArticleTag } from "@/lib/content";
import { getPool, hasDatabaseConfig } from "@/lib/db";
import { saveArticlePreviewSnapshot, usesFileContentFallback } from "@/lib/preview-store";
import { legacyReferenceHtml } from "@/lib/reference-html";
import { listPreviewReferences } from "@/lib/reference-store";
import { crossOriginMutationResponse } from "@/lib/request-security";
import { readJsonBody } from "@/lib/request-json";
import { listPreviewTags } from "@/lib/tag-store";

function isYouTubeUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname.toLowerCase())
      && ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

const previewSchema = z.object({
  originalSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(260),
  title: z.string().trim().min(3).max(240),
  summary: z.string().max(800).default(""),
  youtubeUrl: z.string().trim().max(1000).default("").refine(isYouTubeUrl),
  category: z.string().trim().max(120).default(""),
  authors: z.array(z.string().trim().min(2).max(180)).min(1).max(20),
  tagSlugs: z.array(z.string().trim().min(1).max(140)).max(30).default([]),
  content: z.string().min(1).max(2_000_000),
});

function displayDate(value: Date | string | null) {
  if (!value) return "Rascunho";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(value))
    .replace(" de ", " ")
    .replace(" de ", " ");
}

function articleSnapshot(input: {
  id?: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  youtubeUrl: string;
  category: string;
  authors: string[];
  tags: ArticleTag[];
  publishedAt: Date | string | null;
  references: Array<{ id: string; referenceText: string; referenceHtml: string }>;
}): Article {
  const plainText = input.content.replace(/<[^>]+>/g, " ");
  return {
    id: input.id,
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    contentHtml: input.content,
    youtubeUrl: input.youtubeUrl || undefined,
    category: input.category || "Sem categoria",
    authors: input.authors,
    author: formatAuthorNames(input.authors),
    tags: input.tags,
    publishedAt: displayDate(input.publishedAt),
    updatedAt: displayDate(new Date()),
    readingTime: `${Math.max(1, Math.ceil(plainText.trim().split(/\s+/).filter(Boolean).length / 220))} min`,
    bibliographicReferences: input.references,
    searchText: `${plainText} ${input.references.map((reference) => reference.referenceText).join(" ")}`,
  };
}

export async function POST(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  const token = (await cookies()).get("academia_session")?.value;
  if (!(await verifySession(token))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const parsed = previewSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Revise título, autoria, resumo e conteúdo." }, { status: 400 });

  const content = sanitizeArticleContent(parsed.data.content);
  const referenceIds = Array.from(new Set(extractFootnoteReferenceLinks(content).map((link) => link.referenceId)));

  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    const [availableTags, availableReferences] = await Promise.all([listPreviewTags(), listPreviewReferences()]);
    const tags = parsed.data.tagSlugs
      .map((slug) => availableTags.find((tag) => tag.slug === slug))
      .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));
    const references = availableReferences
      .filter((reference) => referenceIds.includes(reference.id))
      .map((reference) => ({
        id: reference.id,
        referenceText: reference.referenceText,
        referenceHtml: reference.referenceHtml || legacyReferenceHtml(reference.referenceText),
      }));
    const snapshot = articleSnapshot({
      slug: parsed.data.originalSlug,
      title: parsed.data.title,
      summary: parsed.data.summary,
      content,
      youtubeUrl: parsed.data.youtubeUrl,
      category: parsed.data.category,
      authors: parsed.data.authors,
      tags,
      publishedAt: null,
      references,
    });
    await saveArticlePreviewSnapshot(snapshot);
    return NextResponse.json({ slug: snapshot.slug }, { status: 201 });
  }

  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Persistência da prévia indisponível." }, { status: 503 });

  const pool = getPool();
  const articleResult = await pool.query(
    "SELECT id,slug,published_at FROM articles WHERE slug=$1 LIMIT 1",
    [parsed.data.originalSlug],
  );
  if (!articleResult.rowCount) return NextResponse.json({ error: "Artigo não encontrado." }, { status: 404 });

  const [tagsResult, referencesResult] = await Promise.all([
    parsed.data.tagSlugs.length
      ? pool.query(
        `SELECT id,name,slug,kind FROM tags
         WHERE slug=ANY($1::text[])
         ORDER BY array_position($1::text[],slug)`,
        [parsed.data.tagSlugs],
      )
      : Promise.resolve({ rows: [] }),
    referenceIds.length
      ? pool.query(
        `SELECT id,reference_text AS "referenceText",COALESCE(reference_html,'') AS "referenceHtml"
         FROM bibliographic_references WHERE id=ANY($1::uuid[]) ORDER BY lower(reference_text)`,
        [referenceIds],
      )
      : Promise.resolve({ rows: [] }),
  ]);
  const references = referencesResult.rows.map((reference) => ({
    ...reference,
    referenceHtml: reference.referenceHtml || legacyReferenceHtml(reference.referenceText),
  }));
  const snapshot = articleSnapshot({
    id: articleResult.rows[0].id,
    slug: articleResult.rows[0].slug,
    title: parsed.data.title,
    summary: parsed.data.summary,
    content,
    youtubeUrl: parsed.data.youtubeUrl,
    category: parsed.data.category,
    authors: parsed.data.authors,
    tags: tagsResult.rows,
    publishedAt: articleResult.rows[0].published_at,
    references,
  });
  await pool.query(
    `INSERT INTO article_preview_snapshots(article_id,snapshot,updated_at)
     VALUES ($1,$2::jsonb,NOW())
     ON CONFLICT (article_id) DO UPDATE SET snapshot=EXCLUDED.snapshot,updated_at=NOW()`,
    [articleResult.rows[0].id, JSON.stringify(snapshot)],
  );
  return NextResponse.json({ slug: snapshot.slug }, { status: 201 });
}
