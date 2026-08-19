import "server-only";
import { articles as fallbackArticles, formatAuthorNames, type Article } from "./content";
import { getPool, hasDatabaseConfig } from "./db";
import { getPreviewArticle, getPreviewPublishedArticles, usesFileContentFallback } from "./preview-store";
import { legacyReferenceHtml } from "./reference-html";

function readingTime(html: string) { const words = html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length; return `${Math.max(1, Math.ceil(words / 220))} min`; }
function date(value: Date | string | null) { if (!value) return "Data a confirmar"; return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)).replace(" de ", " ").replace(" de ", " "); }

type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string;
  content_html: string;
  youtube_url: string | null;
  author_name: string;
  author_names: string[];
  published_at: Date | string | null;
  updated_at: Date | string;
  category: string;
  tags: Article["tags"];
  bibliography: Array<{ id: string; referenceText: string; referenceHtml?: string }>;
  word_count?: number;
};

export type PublishedArticlePage = {
  articles: Article[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

type PublishedArticleFilters = {
  query?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
};

function mapArticleRow(row: ArticleRow): Article {
  const authors = Array.isArray(row.author_names) && row.author_names.length ? row.author_names : [row.author_name];
  const bibliography = Array.isArray(row.bibliography)
    ? row.bibliography.map((reference) => ({
      ...reference,
      referenceHtml: reference.referenceHtml || legacyReferenceHtml(reference.referenceText),
    }))
    : [];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle || undefined,
    summary: row.summary,
    contentHtml: row.content_html,
    youtubeUrl: row.youtube_url || undefined,
    author: formatAuthorNames(authors),
    authors,
    category: row.category,
    tags: row.tags,
    publishedAt: date(row.published_at),
    updatedAt: date(row.updated_at),
    readingTime: readingTime(row.content_html),
    bibliographicReferences: bibliography,
    searchText: `${row.content_html.replace(/<[^>]+>/g, " ")} ${bibliography.map((reference) => reference.referenceText).join(" ")}`,
  };
}

function mapArticleSummary(row: ArticleRow): Article {
  const authors = Array.isArray(row.author_names) && row.author_names.length ? row.author_names : [row.author_name];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle || undefined,
    summary: row.summary,
    author: formatAuthorNames(authors),
    authors,
    category: row.category,
    tags: Array.isArray(row.tags) ? row.tags : [],
    publishedAt: date(row.published_at),
    updatedAt: date(row.updated_at),
    readingTime: `${Math.max(1, Math.ceil(Number(row.word_count || 0) / 220))} min`,
  };
}

const articleSelect = `
  SELECT a.id, a.slug, a.title, a.subtitle, a.summary, a.content_html, a.youtube_url,
         a.author_name, a.author_names, a.published_at, a.updated_at,
         COALESCE(c.name,'Sem categoria') category,
         COALESCE((
           SELECT jsonb_agg(
             jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug,'kind',t.kind)
             ORDER BY at.display_order,t.name
           )
           FROM article_tags at
           JOIN tags t ON t.id=at.tag_id
           WHERE at.article_id=a.id
         ),'[]'::jsonb) tags,
         COALESCE((
           SELECT jsonb_agg(
             jsonb_build_object(
               'id',refs.id,
               'referenceText',refs.reference_text,
               'referenceHtml',COALESCE(refs.reference_html,'')
             )
             ORDER BY lower(refs.reference_text)
           )
           FROM (
             SELECT DISTINCT br.id,br.reference_text,br.reference_html
             FROM article_footnote_references afr
             JOIN bibliographic_references br ON br.id=afr.reference_id
             WHERE afr.article_id=a.id
           ) refs
         ),'[]'::jsonb) AS bibliography
  FROM articles a
  LEFT JOIN categories c ON c.id=a.category_id
`;

const articleSummarySelect = `
  SELECT a.id, a.slug, a.title, a.subtitle, a.summary,
         a.author_name, a.author_names, a.published_at, a.updated_at,
         COALESCE(c.name,'Sem categoria') category,
         COALESCE(array_length(regexp_split_to_array(
           NULLIF(trim(regexp_replace(a.content_html, '<[^>]+>', ' ', 'g')), ''), '[[:space:]]+'
         ),1),0)::int AS word_count,
         COALESCE((
           SELECT jsonb_agg(
             jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug,'kind',t.kind)
             ORDER BY at.display_order,t.name
           )
           FROM article_tags at
           JOIN tags t ON t.id=at.tag_id
           WHERE at.article_id=a.id
         ),'[]'::jsonb) tags
  FROM articles a
  LEFT JOIN categories c ON c.id=a.category_id
`;

function normalizeFilters(filters: PublishedArticleFilters) {
  const pageSize = Math.min(50, Math.max(1, Math.trunc(filters.pageSize || 12)));
  const page = Math.max(1, Math.trunc(filters.page || 1));
  return {
    query: (filters.query || "").trim().slice(0, 160),
    tag: (filters.tag || "").trim().slice(0, 140),
    page,
    pageSize,
  };
}

function filterPreviewArticles(articles: Article[], query: string, tag: string) {
  const needle = query.toLocaleLowerCase("pt-BR");
  return articles.filter((article) => {
    const matchesTag = !tag || article.tags.some((item) => item.slug === tag);
    if (!matchesTag || !needle) return matchesTag;
    const haystack = [
      article.title,
      article.summary,
      ...(article.authors || [article.author]),
      ...article.tags.map((item) => item.name),
      article.searchText || article.contentHtml || "",
    ].join(" ").replace(/<[^>]+>/g, " ").toLocaleLowerCase("pt-BR");
    return haystack.includes(needle);
  });
}

function databaseFilters(query: string, tag: string) {
  const values: string[] = [];
  const clauses = ["a.status='published'"];
  if (query) {
    values.push(`%${query}%`);
    const parameter = `$${values.length}`;
    clauses.push(`(
      a.title ILIKE ${parameter}
      OR a.summary ILIKE ${parameter}
      OR a.content_html ILIKE ${parameter}
      OR a.author_name ILIKE ${parameter}
      OR a.author_names::text ILIKE ${parameter}
      OR EXISTS (
        SELECT 1 FROM article_tags searched_at
        JOIN tags searched_tag ON searched_tag.id=searched_at.tag_id
        WHERE searched_at.article_id=a.id AND searched_tag.name ILIKE ${parameter}
      )
      OR EXISTS (
        SELECT 1 FROM article_footnote_references afr
        JOIN bibliographic_references br ON br.id=afr.reference_id
        WHERE afr.article_id=a.id AND br.reference_text ILIKE ${parameter}
      )
    )`);
  }
  if (tag) {
    values.push(tag);
    clauses.push(`EXISTS (
      SELECT 1 FROM article_tags selected_at
      JOIN tags selected_tag ON selected_tag.id=selected_at.tag_id
      WHERE selected_at.article_id=a.id AND selected_tag.slug=$${values.length}
    )`);
  }
  return { where: clauses.join(" AND "), values };
}

export async function getPublishedArticlePage(filters: PublishedArticleFilters = {}): Promise<PublishedArticlePage> {
  const normalized = normalizeFilters(filters);
  if (!hasDatabaseConfig()) {
    const source = usesFileContentFallback() ? await getPreviewPublishedArticles() : fallbackArticles;
    const filtered = filterPreviewArticles(source, normalized.query, normalized.tag);
    const pageCount = Math.max(1, Math.ceil(filtered.length / normalized.pageSize));
    const page = Math.min(normalized.page, pageCount);
    const start = (page - 1) * normalized.pageSize;
    return {
      articles: filtered.slice(start, start + normalized.pageSize),
      total: filtered.length,
      page,
      pageSize: normalized.pageSize,
      pageCount,
    };
  }

  try {
    const { where, values } = databaseFilters(normalized.query, normalized.tag);
    const countResult = await getPool().query(`SELECT COUNT(*)::int AS total FROM articles a WHERE ${where}`, values);
    const total = Number(countResult.rows[0]?.total || 0);
    const pageCount = Math.max(1, Math.ceil(total / normalized.pageSize));
    const page = Math.min(normalized.page, pageCount);
    const queryValues = [...values, normalized.pageSize, (page - 1) * normalized.pageSize];
    const result = await getPool().query(`${articleSummarySelect}
      WHERE ${where}
      ORDER BY a.published_at DESC NULLS LAST, a.updated_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, queryValues);
    return {
      articles: result.rows.map(mapArticleSummary),
      total,
      page,
      pageSize: normalized.pageSize,
      pageCount,
    };
  } catch (error) {
    console.error("published_article_page_fallback", error instanceof Error ? error.message : "unknown");
    const filtered = filterPreviewArticles(fallbackArticles, normalized.query, normalized.tag);
    const pageCount = Math.max(1, Math.ceil(filtered.length / normalized.pageSize));
    const page = Math.min(normalized.page, pageCount);
    const start = (page - 1) * normalized.pageSize;
    return { articles: filtered.slice(start, start + normalized.pageSize), total: filtered.length, page, pageSize: normalized.pageSize, pageCount };
  }
}

export async function getRecentPublishedArticles(limit = 3): Promise<Article[]> {
  const normalizedLimit = Math.min(12, Math.max(1, Math.trunc(limit)));
  if (!hasDatabaseConfig()) {
    const source = usesFileContentFallback() ? await getPreviewPublishedArticles() : fallbackArticles;
    return source.slice(0, normalizedLimit);
  }
  try {
    const result = await getPool().query(`${articleSummarySelect}
      WHERE a.status='published'
      ORDER BY a.published_at DESC NULLS LAST, a.updated_at DESC
      LIMIT $1`, [normalizedLimit]);
    return result.rows.map(mapArticleSummary);
  } catch (error) {
    console.error("recent_articles_fallback", error instanceof Error ? error.message : "unknown");
    return fallbackArticles.slice(0, normalizedLimit);
  }
}

export async function getPublishedArticle(slug: string): Promise<Article | undefined> {
  if (!hasDatabaseConfig() && usesFileContentFallback()) return (await getPreviewPublishedArticles()).find((article) => article.slug === slug);
  if (!hasDatabaseConfig()) return fallbackArticles.find((article) => article.slug === slug);
  try {
    const result = await getPool().query(`${articleSelect} WHERE a.status='published' AND a.slug=$1 LIMIT 1`, [slug]);
    return result.rows[0] ? mapArticleRow(result.rows[0]) : undefined;
  } catch (error) {
    console.error("published_article_fallback", error instanceof Error ? error.message : "unknown");
    return fallbackArticles.find((article) => article.slug === slug);
  }
}

export async function getArticleForAdminPreview(slug: string): Promise<Article | undefined> {
  if (!hasDatabaseConfig() && usesFileContentFallback()) return getPreviewArticle(slug);
  if (!hasDatabaseConfig()) return fallbackArticles.find((article) => article.slug === slug);
  const result = await getPool().query(`${articleSelect} WHERE a.slug=$1 LIMIT 1`, [slug]);
  return result.rows[0] ? mapArticleRow(result.rows[0]) : undefined;
}
