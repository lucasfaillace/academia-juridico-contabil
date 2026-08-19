import "server-only";

import { extractFootnoteReferenceLinks } from "./bibliographic-references";
import { getPool, hasDatabaseConfig } from "./db";
import { fallbackArticleHtml } from "./fallback-article-html";
import { listStoredArticles, usesFileContentFallback } from "./preview-store";
import { legacyReferenceHtml, sanitizeBibliographicReferenceHtml } from "./reference-html";
import { listPreviewReferences } from "./reference-store";
import type { WordExportArticle } from "./article-word-export";

function authors(authorNames: unknown, legacyAuthor: string | null | undefined) {
  if (Array.isArray(authorNames)) {
    const names = authorNames.filter((name): name is string => typeof name === "string" && Boolean(name.trim()));
    if (names.length) return names;
  }
  return [legacyAuthor?.trim() || "Autoria não informada"];
}

export async function listArticlesForWordExport(slug?: string): Promise<WordExportArticle[]> {
  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    const [storedArticles, references] = await Promise.all([listStoredArticles(), listPreviewReferences()]);
    return storedArticles
      .filter((article) => !slug || article.slug === slug)
      .map((article) => {
        const referenceIds = new Set(extractFootnoteReferenceLinks(article.content_html).map((link) => link.referenceId));
        return {
          title: article.title,
          slug: article.slug,
          contentHtml: article.content_html.trim() || fallbackArticleHtml,
          summary: article.summary,
          youtubeUrl: article.youtube_url,
          authors: authors(article.author_names, article.author_name),
          category: article.category,
          tags: article.tags.map((tag) => ({ name: tag.name })),
          bibliographicReferences: references
            .filter((reference) => referenceIds.has(reference.id))
            .map((reference) => ({
              id: reference.id,
              referenceText: reference.referenceText,
              referenceHtml: sanitizeBibliographicReferenceHtml(
                reference.referenceHtml || legacyReferenceHtml(reference.referenceText),
              ),
            })),
          publishedAt: article.published_at,
          updatedAt: article.updated_at,
        };
      });
  }

  const result = await getPool().query(
    `SELECT a.title, a.slug, a.summary, a.content_html, a.youtube_url, a.author_name, a.author_names, a.published_at, a.updated_at,
            COALESCE(c.name, 'Sem categoria') AS category,
            COALESCE(jsonb_agg(jsonb_build_object('name', t.name) ORDER BY at.display_order, t.name)
              FILTER (WHERE t.name IS NOT NULL), '[]'::jsonb) AS tags,
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
            ), '[]'::jsonb) AS bibliography
     FROM articles a
     LEFT JOIN categories c ON c.id = a.category_id
     LEFT JOIN article_tags at ON at.article_id = a.id
     LEFT JOIN tags t ON t.id = at.tag_id
     WHERE ($1::text IS NULL OR a.slug=$1)
     GROUP BY a.id, c.name
     ORDER BY COALESCE(a.published_at, a.updated_at) DESC, a.title`,
    [slug || null],
  );

  return result.rows.map((row) => ({
    title: row.title,
    slug: row.slug,
    contentHtml: row.content_html?.trim() || fallbackArticleHtml,
    summary: row.summary,
    youtubeUrl: row.youtube_url,
    authors: authors(row.author_names, row.author_name),
    category: row.category,
    tags: row.tags,
    bibliographicReferences: Array.isArray(row.bibliography)
      ? row.bibliography.map((reference: { id: string; referenceText: string; referenceHtml?: string }) => ({
        id: reference.id,
        referenceText: reference.referenceText,
        referenceHtml: sanitizeBibliographicReferenceHtml(
          reference.referenceHtml || legacyReferenceHtml(reference.referenceText),
        ),
      }))
      : [],
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

export async function findArticleForWordExport(slug: string) {
  return (await listArticlesForWordExport(slug))[0] || null;
}
