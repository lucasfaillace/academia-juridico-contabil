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

export async function getPublishedArticles(): Promise<Article[]> {
  if (!hasDatabaseConfig() && usesFileContentFallback()) return getPreviewPublishedArticles();
  if (!hasDatabaseConfig()) return fallbackArticles;
  try {
    const result = await getPool().query(`${articleSelect}
      WHERE a.status='published'
      ORDER BY a.published_at DESC NULLS LAST`);
    return result.rows.map(mapArticleRow);
  } catch (error) { console.error("published_articles_fallback", error instanceof Error ? error.message : "unknown"); return fallbackArticles; }
}

export async function getPublishedArticle(slug: string) { return (await getPublishedArticles()).find((article) => article.slug === slug); }

export async function getArticleForAdminPreview(slug: string): Promise<Article | undefined> {
  if (!hasDatabaseConfig() && usesFileContentFallback()) return getPreviewArticle(slug);
  if (!hasDatabaseConfig()) return fallbackArticles.find((article) => article.slug === slug);
  const result = await getPool().query(`${articleSelect} WHERE a.slug=$1 LIMIT 1`, [slug]);
  return result.rows[0] ? mapArticleRow(result.rows[0]) : undefined;
}
