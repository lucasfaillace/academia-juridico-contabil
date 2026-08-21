import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { extractFootnoteReferenceLinks } from "@/lib/bibliographic-references";
import { deletePreviewCommentsForArticle } from "@/lib/comment-store";
import { getPool, hasDatabaseConfig } from "@/lib/db";
import { deleteStoredArticle, listStoredArticles, saveStoredArticle, usesFileContentFallback } from "@/lib/preview-store";
import { listPreviewTags } from "@/lib/tag-store";
import { crossOriginMutationResponse } from "@/lib/request-security";
import { purgeOptionalCloudflareCache } from "@/lib/cloudflare-cache";
import { readJsonBody } from "@/lib/request-json";

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

const articleSchema = z.object({
  title: z.string().trim().min(3).max(240),
  originalSlug: z.string().max(260).optional(),
  summary: z.string().max(800).default(""),
  youtubeUrl: z.string().trim().max(1000).default("").refine(isYouTubeUrl),
  category: z.string().trim().max(120).default(""),
  authors: z.array(z.string().trim().min(2).max(180)).min(1).max(20),
  tagSlugs: z.array(z.string().trim().min(1).max(140)).max(30).default([]),
  content: z.string().min(1).max(2_000_000),
  status: z.enum(["draft", "published"]),
});

const deleteArticleSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(260),
});

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function authenticated(token: string | undefined) {
  return verifySession(token);
}

function sanitizeContent(content: string) {
  return sanitizeHtml(content, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "picture", "source", "figure", "figcaption", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "sup", "sub", "u", "section"]),
    allowedAttributes: {
      a: ["href", "id", "aria-label", "class", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading", "decoding"],
      source: ["srcset", "media", "type", "width", "height"],
      figure: ["data-article-image", "data-image-width", "data-image-align", "data-image-fit", "data-image-zoom", "data-image-border", "data-image-original-src", "data-image-mobile-src", "data-image-trimmed-src"],
      div: ["data-article-toc", "data-article-formula", "data-latex", "data-display", "data-image-frame"],
      sup: [
        "id",
        "title",
        "data-footnote",
        "data-footnote-id",
        "data-footnote-number",
        "data-footnote-text",
        "data-footnote-reference-id",
        "data-footnote-citation-details",
        "data-footnote-segments",
      ],
      section: ["id", "class"],
      "*": ["id", "class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    transformTags: {
      h1: "h2",
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: attributes.target === "_blank"
          ? { ...attributes, rel: "noopener noreferrer" }
          : attributes,
      }),
      img: (_tagName, attributes) => {
        const dataSourceIsSafe = !attributes.src?.startsWith("data:")
          || /^data:image\/(?:jpeg|png|webp);base64,/i.test(attributes.src);
        const safeAttributes = { ...attributes };
        if (!dataSourceIsSafe) delete safeAttributes.src;
        return {
          tagName: "img",
          attribs: {
            ...safeAttributes,
            loading: "lazy",
            decoding: "async",
          },
        };
      },
    },
  });
}

async function invalidateArticlePages(slug: string, previousSlug?: string) {
  const paths = ["/", "/blog", `/blog/${slug}`];
  if (previousSlug && previousSlug !== slug) paths.push(`/blog/${previousSlug}`);
  for (const path of paths) revalidatePath(path);
  await purgeOptionalCloudflareCache({ paths });
}

async function syncFootnoteReferences(client: PoolClient, articleId: string, content: string) {
  await client.query("DELETE FROM article_footnote_references WHERE article_id=$1", [articleId]);
  for (const link of extractFootnoteReferenceLinks(content)) {
    await client.query(
      `INSERT INTO article_footnote_references(article_id,footnote_id,reference_id,note_number,citation_details,occurrence_index)
       SELECT $1,$2,id,$4,$5,$6
       FROM bibliographic_references
       WHERE id=$3
       ON CONFLICT (article_id,footnote_id,occurrence_index) DO UPDATE SET
         reference_id=EXCLUDED.reference_id,
         note_number=EXCLUDED.note_number,
         citation_details=EXCLUDED.citation_details`,
      [articleId, link.footnoteId, link.referenceId, link.noteNumber, link.citationDetails, link.occurrenceIndex],
    );
  }
}

function adminListParameters(request: Request) {
  const search = new URL(request.url).searchParams;
  const page = Math.max(1, Number.parseInt(search.get("page") || "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(search.get("pageSize") || "25", 10) || 25));
  const status = search.get("status");
  const updatedDays = Math.min(3650, Math.max(0, Number.parseInt(search.get("updatedDays") || "0", 10) || 0));
  return {
    slug: (search.get("slug") || "").trim().slice(0, 260),
    query: (search.get("q") || "").trim().slice(0, 160),
    tag: (search.get("tag") || "").trim().slice(0, 140),
    status: status === "draft" || status === "published" ? status : "",
    updatedDays,
    page,
    pageSize,
  };
}

function previewArticleSummary(article: Awaited<ReturnType<typeof listStoredArticles>>[number]) {
  return {
    title: article.title,
    slug: article.slug,
    summary: article.summary,
    youtube_url: article.youtube_url,
    tags: article.tags,
    category: article.category,
    status: article.status,
    author_name: article.author_name,
    author_names: article.author_names,
    published_at: article.published_at,
    updated_at: article.updated_at,
  };
}

export async function GET(request: Request) {
  if (!(await authenticated((await cookies()).get("academia_session")?.value))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const filters = adminListParameters(request);

  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    const stored = await listStoredArticles();
    if (filters.slug) {
      const article = stored.find((item) => item.slug === filters.slug);
      return article
        ? NextResponse.json(article)
        : NextResponse.json({ error: "Artigo não encontrado" }, { status: 404 });
    }
    const normalizedQuery = filters.query.toLocaleLowerCase("pt-BR");
    const cutoff = filters.updatedDays ? Date.now() - filters.updatedDays * 86_400_000 : 0;
    const filtered = stored.filter((article) => {
      const authors = [article.author_name, ...(article.author_names || [])].join(" ");
      return (!filters.status || article.status === filters.status)
        && (!filters.tag || article.tags.some((tag) => tag.slug === filters.tag))
        && (!cutoff || Date.parse(article.updated_at) >= cutoff)
        && (!normalizedQuery || `${article.title} ${authors}`.toLocaleLowerCase("pt-BR").includes(normalizedQuery));
    });
    const pageCount = Math.max(1, Math.ceil(filtered.length / filters.pageSize));
    const page = Math.min(filters.page, pageCount);
    const start = (page - 1) * filters.pageSize;
    return NextResponse.json({
      articles: filtered.slice(start, start + filters.pageSize).map(previewArticleSummary),
      total: filtered.length,
      page,
      pageSize: filters.pageSize,
      pageCount,
      totals: {
        all: stored.length,
        published: stored.filter((article) => article.status === "published").length,
      },
    });
  }

  try {
    if (filters.slug) {
      const result = await getPool().query(`
        SELECT a.id, a.title, a.slug, a.summary, a.content_html, a.youtube_url, a.status, a.author_name, a.author_names, a.updated_at,
             COALESCE(c.name, 'Sem categoria') AS category,
             COALESCE((
               SELECT jsonb_agg(
                 jsonb_build_object(
                   'id', refs.id,
                   'referenceText', refs.reference_text,
                   'referenceHtml', COALESCE(refs.reference_html, '')
                 )
                 ORDER BY lower(refs.reference_text)
               )
               FROM (
                 SELECT DISTINCT br.id, br.reference_text, br.reference_html
                 FROM article_footnote_references afr
                 JOIN bibliographic_references br ON br.id=afr.reference_id
                 WHERE afr.article_id=a.id
               ) refs
             ), '[]'::jsonb) AS "bibliographicReferences",
             COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug,'kind',t.kind) ORDER BY at.display_order, t.name)
               FILTER (WHERE t.name IS NOT NULL),'[]'::jsonb) AS tags
        FROM articles a
        LEFT JOIN categories c ON c.id = a.category_id
        LEFT JOIN article_tags at ON at.article_id=a.id
        LEFT JOIN tags t ON t.id=at.tag_id
        WHERE a.slug=$1
        GROUP BY a.id,c.name
        LIMIT 1`, [filters.slug]);
      return result.rows[0]
        ? NextResponse.json(result.rows[0])
        : NextResponse.json({ error: "Artigo não encontrado" }, { status: 404 });
    }

    const values: Array<string | number> = [];
    const clauses = ["TRUE"];
    if (filters.query) {
      values.push(`%${filters.query}%`);
      const parameter = `$${values.length}`;
      clauses.push(`(a.title ILIKE ${parameter} OR a.author_name ILIKE ${parameter} OR a.author_names::text ILIKE ${parameter})`);
    }
    if (filters.status) {
      values.push(filters.status);
      clauses.push(`a.status=$${values.length}`);
    }
    if (filters.tag) {
      values.push(filters.tag);
      clauses.push(`EXISTS (
        SELECT 1 FROM article_tags filtered_at
        JOIN tags filtered_tag ON filtered_tag.id=filtered_at.tag_id
        WHERE filtered_at.article_id=a.id AND filtered_tag.slug=$${values.length}
      )`);
    }
    if (filters.updatedDays) {
      values.push(filters.updatedDays);
      clauses.push(`a.updated_at >= NOW() - ($${values.length}::int * INTERVAL '1 day')`);
    }
    const where = clauses.join(" AND ");
    const [countResult, totalsResult] = await Promise.all([
      getPool().query(`SELECT COUNT(*)::int AS total FROM articles a WHERE ${where}`, values),
      getPool().query(`SELECT COUNT(*)::int AS all,
        COUNT(*) FILTER (WHERE status='published')::int AS published FROM articles`),
    ]);
    const total = Number(countResult.rows[0]?.total || 0);
    const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
    const page = Math.min(filters.page, pageCount);
    const listValues = [...values, filters.pageSize, (page - 1) * filters.pageSize];
    const result = await getPool().query(`
      SELECT a.id, a.title, a.slug, a.summary, a.youtube_url, a.status, a.author_name, a.author_names, a.updated_at,
             COALESCE(c.name, 'Sem categoria') AS category,
             COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug,'kind',t.kind) ORDER BY at.display_order, t.name)
               FILTER (WHERE t.name IS NOT NULL),'[]'::jsonb) AS tags
      FROM articles a
      LEFT JOIN categories c ON c.id = a.category_id
      LEFT JOIN article_tags at ON at.article_id=a.id
      LEFT JOIN tags t ON t.id=at.tag_id
      WHERE ${where}
      GROUP BY a.id,c.name
      ORDER BY a.updated_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `, listValues);
    return NextResponse.json({
      articles: result.rows,
      total,
      page,
      pageSize: filters.pageSize,
      pageCount,
      totals: {
        all: Number(totalsResult.rows[0]?.all || 0),
        published: Number(totalsResult.rows[0]?.published || 0),
      },
    });
  } catch {
    return NextResponse.json({ error: "Banco de dados indisponível" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authenticated((await cookies()).get("academia_session")?.value))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = articleSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Revise título, autoria, resumo e conteúdo." }, { status: 400 });

  const slug = slugify(parsed.data.title);
  const categorySlug = slugify(parsed.data.category || "Sem categoria");
  const content = sanitizeContent(parsed.data.content);
  const authors = parsed.data.authors.map((name) => name.trim()).filter(Boolean);
  const primaryAuthor = authors[0] || process.env.DEFAULT_AUTHOR_NAME || "Autor";

  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    const availableTags = await listPreviewTags();
    const selectedTags = parsed.data.tagSlugs
      .map((tagSlug) => availableTags.find((tag) => tag.slug === tagSlug))
      .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));
    const article = await saveStoredArticle({
      ...parsed.data,
      slug,
      content,
      youtubeUrl: parsed.data.youtubeUrl,
      tags: selectedTags,
      authors,
    });
    await invalidateArticlePages(slug, parsed.data.originalSlug);
    return NextResponse.json(article, { status: 201 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const categoryResult = await client.query(
      "INSERT INTO categories (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id",
      [parsed.data.category || "Sem categoria", categorySlug],
    );
    const categoryId = categoryResult.rows[0].id;
    let result;
    if (parsed.data.originalSlug) {
      result = await client.query(
        `UPDATE articles
         SET title=$1, slug=$2, summary=$3, content_html=$4, youtube_url=$5, status=$6::varchar, author_name=$7, author_names=$8::jsonb, category_id=$9,
             updated_at=NOW(), published_at=CASE WHEN $6::text='published' THEN COALESCE(published_at,NOW()) ELSE NULL END
         WHERE slug=$10
         RETURNING id, slug, status`,
        [parsed.data.title, slug, parsed.data.summary, content, parsed.data.youtubeUrl || null, parsed.data.status, primaryAuthor, JSON.stringify(authors), categoryId, parsed.data.originalSlug],
      );
    }
    if (!result || !result.rowCount) {
      result = await client.query(
        `INSERT INTO articles (title, slug, summary, content_html, youtube_url, status, author_name, author_names, category_id, published_at)
         VALUES ($1,$2,$3,$4,$5,$6::varchar,$7,$8::jsonb,$9,CASE WHEN $6::text='published' THEN NOW() ELSE NULL END)
         ON CONFLICT (slug) DO UPDATE SET
           title=EXCLUDED.title, summary=EXCLUDED.summary, content_html=EXCLUDED.content_html, youtube_url=EXCLUDED.youtube_url,
           status=EXCLUDED.status, author_name=EXCLUDED.author_name, author_names=EXCLUDED.author_names, category_id=EXCLUDED.category_id,
           updated_at=NOW(), published_at=CASE WHEN EXCLUDED.status='published' THEN COALESCE(articles.published_at,NOW()) ELSE NULL END
         RETURNING id, slug, status`,
        [parsed.data.title, slug, parsed.data.summary, content, parsed.data.youtubeUrl || null, parsed.data.status, primaryAuthor, JSON.stringify(authors), categoryId],
      );
    }
    const articleId = result.rows[0].id;
    await client.query("DELETE FROM article_tags WHERE article_id=$1", [articleId]);
    for (const [displayOrder, tagSlug] of parsed.data.tagSlugs.entries()) {
      const tagResult = await client.query("SELECT id FROM tags WHERE slug=$1", [tagSlug]);
      if (!tagResult.rowCount) continue;
      await client.query(
        "INSERT INTO article_tags(article_id,tag_id,display_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [articleId, tagResult.rows[0].id, displayOrder],
      );
    }
    await syncFootnoteReferences(client, articleId, content);
    await client.query("COMMIT");
    await invalidateArticlePages(slug, parsed.data.originalSlug);
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("article_save_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível salvar o artigo." }, { status: 503 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authenticated((await cookies()).get("academia_session")?.value))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = deleteArticleSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Artigo inválido." }, { status: 400 });
  const { slug } = parsed.data;

  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    const deleted = await deleteStoredArticle(slug);
    if (!deleted) return NextResponse.json({ error: "Artigo não encontrado." }, { status: 404 });
    await deletePreviewCommentsForArticle(slug);
    await invalidateArticlePages(slug);
    return NextResponse.json({ ok: true });
  }

  try {
    const result = await getPool().query("DELETE FROM articles WHERE slug=$1 RETURNING slug", [slug]);
    if (!result.rowCount) return NextResponse.json({ error: "Artigo não encontrado." }, { status: 404 });
    await invalidateArticlePages(slug);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("article_delete_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível excluir o artigo." }, { status: 503 });
  }
}
