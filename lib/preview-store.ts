import "server-only";

import { articles as fallbackArticles, type Article, type ArticleTag } from "./content";
import { extractFootnoteReferenceLinks } from "./bibliographic-references";
import { readPreviewDataFile, writePreviewDataFile } from "./preview-file-store";
import { legacyReferenceHtml } from "./reference-html";
import { listPreviewReferences } from "./reference-store";

export type StoredArticle = {
  title: string;
  slug: string;
  summary: string;
  content_html: string;
  youtube_url?: string;
  tags: ArticleTag[];
  category: string;
  status: "draft" | "published";
  author_name: string;
  author_names?: string[];
  published_at: string | null;
  updated_at: string;
};

export function usesFileContentFallback() {
  return process.env.CONTENT_FALLBACK_MODE === "file";
}

const previewArticlesFilename = "articles.json";
const articlePreviewSnapshotsFilename = "article-preview-snapshots.json";
const previewDeletedArticlesFilename = "deleted-articles.json";
const legacyPreviewArticlesPath = "/tmp/academia-preview-articles.json";
const legacyPreviewDeletedArticlesPath = "/tmp/academia-preview-deleted-articles.json";

function slugifyTag(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function normalizeTags(tags: ArticleTag[] | undefined) {
  return (tags || []).map((tag) => ({ ...tag, slug: tag.slug || slugifyTag(tag.name) }));
}

function normalizeAuthors(authors: string[] | undefined, legacyAuthor?: string) {
  const names = (authors || []).map((name) => name.trim()).filter(Boolean);
  return names.length ? names : [legacyAuthor?.trim() || "Autoria a confirmar"];
}

async function readOverrides(): Promise<StoredArticle[]> {
  try {
    const articles = JSON.parse(await readPreviewDataFile(previewArticlesFilename, legacyPreviewArticlesPath)) as StoredArticle[];
    return articles.map((article) => ({
      ...article,
      tags: normalizeTags(article.tags),
      author_names: normalizeAuthors(article.author_names, article.author_name),
    }));
  } catch {
    return [];
  }
}

async function readDeletedSlugs() {
  try {
    const slugs = JSON.parse(await readPreviewDataFile(previewDeletedArticlesFilename, legacyPreviewDeletedArticlesPath)) as unknown;
    return new Set(Array.isArray(slugs) ? slugs.filter((slug): slug is string => typeof slug === "string") : []);
  } catch {
    return new Set<string>();
  }
}

async function writeDeletedSlugs(slugs: Set<string>) {
  await writePreviewDataFile(previewDeletedArticlesFilename, `${JSON.stringify(Array.from(slugs).sort(), null, 2)}\n`);
}

async function readArticlePreviewSnapshots() {
  try {
    const snapshots = JSON.parse(await readPreviewDataFile(articlePreviewSnapshotsFilename)) as unknown;
    return Array.isArray(snapshots) ? snapshots as Article[] : [];
  } catch {
    return [];
  }
}

export async function saveArticlePreviewSnapshot(article: Article) {
  const snapshots = (await readArticlePreviewSnapshots()).filter((snapshot) => snapshot.slug !== article.slug);
  snapshots.push(article);
  await writePreviewDataFile(articlePreviewSnapshotsFilename, `${JSON.stringify(snapshots, null, 2)}\n`);
}

export async function getArticlePreviewSnapshot(slug: string) {
  return (await readArticlePreviewSnapshots()).find((snapshot) => snapshot.slug === slug);
}

export async function deleteArticlePreviewSnapshot(slug: string) {
  const snapshots = await readArticlePreviewSnapshots();
  const remaining = snapshots.filter((snapshot) => snapshot.slug !== slug);
  if (remaining.length !== snapshots.length) {
    await writePreviewDataFile(articlePreviewSnapshotsFilename, `${JSON.stringify(remaining, null, 2)}\n`);
  }
}

function fallbackRecords(): StoredArticle[] {
  const publicationDates = ["2026-07-22", "2026-07-15", "2026-07-08", "2026-07-01"];
  const updateDates = ["2026-07-22", "2026-07-18", "2026-07-08", "2026-07-03"];
  return fallbackArticles.map((article, index) => ({
    title: article.title,
    slug: article.slug,
    summary: article.summary,
    content_html: article.contentHtml || "",
    youtube_url: article.youtubeUrl || "",
    tags: normalizeTags(article.tags),
    category: article.category,
    status: "published",
    author_name: article.author,
    author_names: article.authors,
    published_at: new Date(`${publicationDates[index]}T12:00:00.000Z`).toISOString(),
    updated_at: new Date(`${updateDates[index]}T12:00:00.000Z`).toISOString(),
  }));
}

export async function listStoredArticles() {
  const merged = new Map(fallbackRecords().map((article) => [article.slug, article]));
  for (const article of await readOverrides()) merged.set(article.slug, article);
  for (const slug of await readDeletedSlugs()) merged.delete(slug);
  return Array.from(merged.values()).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function saveStoredArticle(input: {
  title: string;
  slug: string;
  originalSlug?: string;
  summary: string;
  content: string;
  youtubeUrl: string;
  tags: ArticleTag[];
  category: string;
  status: "draft" | "published";
  authors: string[];
}) {
  const overrides = await readOverrides();
  const now = new Date().toISOString();
  const existingIndex = overrides.findIndex((article) => article.slug === (input.originalSlug || input.slug));
  const existing = existingIndex >= 0 ? overrides[existingIndex] : undefined;
  const authors = normalizeAuthors(input.authors);
  const record: StoredArticle = {
    title: input.title,
    slug: input.slug,
    summary: input.summary,
    content_html: input.content,
    youtube_url: input.youtubeUrl,
    tags: normalizeTags(input.tags),
    category: input.category || "Sem categoria",
    status: input.status,
    author_name: authors[0],
    author_names: authors,
    published_at: input.status === "published" ? existing?.published_at || now : null,
    updated_at: now,
  };
  if (existingIndex >= 0) overrides.splice(existingIndex, 1, record);
  else overrides.push(record);

  const deletedSlugs = await readDeletedSlugs();
  deletedSlugs.delete(input.slug);
  if (input.originalSlug && input.originalSlug !== input.slug) deletedSlugs.add(input.originalSlug);

  await writePreviewDataFile(previewArticlesFilename, `${JSON.stringify(overrides, null, 2)}\n`);
  await writeDeletedSlugs(deletedSlugs);
  return record;
}

export async function deleteStoredArticle(slug: string) {
  const available = await listStoredArticles();
  if (!available.some((article) => article.slug === slug)) return false;
  const overrides = (await readOverrides()).filter((article) => article.slug !== slug);
  const deletedSlugs = await readDeletedSlugs();
  deletedSlugs.add(slug);
  await writeOverrides(overrides);
  await writeDeletedSlugs(deletedSlugs);
  return true;
}

async function writeOverrides(overrides: StoredArticle[]) {
  await writePreviewDataFile(previewArticlesFilename, `${JSON.stringify(overrides, null, 2)}\n`);
}

export async function replaceStoredTag(previousSlug: string, tag: ArticleTag) {
  const overrides = await readOverrides();
  let changed = false;
  for (const article of overrides) {
    article.tags = normalizeTags(article.tags).map((current) => {
      if (current.slug !== previousSlug) return current;
      changed = true;
      return tag;
    });
  }
  if (changed) await writeOverrides(overrides);
}

export async function removeStoredTag(tagSlug: string) {
  const overrides = await readOverrides();
  let changed = false;
  for (const article of overrides) {
    const next = normalizeTags(article.tags).filter((tag) => tag.slug !== tagSlug);
    if (next.length !== article.tags.length) changed = true;
    article.tags = next;
  }
  if (changed) await writeOverrides(overrides);
}

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(value))
    .replace(".", "");
}

export async function getPreviewPublishedArticles(): Promise<Article[]> {
  const [storedArticles, storedReferences] = await Promise.all([listStoredArticles(), listPreviewReferences()]);
  return storedArticles
    .filter((article) => article.status === "published")
    .map((article) => storedArticleToArticle(article, storedReferences));
}

function storedArticleToArticle(
  article: StoredArticle,
  storedReferences: Awaited<ReturnType<typeof listPreviewReferences>>,
): Article {
  const authors = normalizeAuthors(article.author_names, article.author_name);
  const referenceIds = new Set(extractFootnoteReferenceLinks(article.content_html).map((link) => link.referenceId));
  const bibliography = storedReferences
    .filter((reference) => referenceIds.has(reference.id))
    .map((reference) => ({
      id: reference.id,
      referenceText: reference.referenceText,
      referenceHtml: reference.referenceHtml || legacyReferenceHtml(reference.referenceText),
    }))
    .sort((a, b) => a.referenceText.localeCompare(b.referenceText, "pt-BR"));
  return {
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    category: article.category,
    tags: normalizeTags(article.tags),
    author: authors.join(", "),
    authors,
    publishedAt: formatDate(article.published_at) || "Rascunho",
    updatedAt: formatDate(article.updated_at),
    readingTime: `${Math.max(1, Math.ceil(article.content_html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length / 220))} min`,
    contentHtml: article.content_html || undefined,
    youtubeUrl: article.youtube_url || undefined,
    bibliographicReferences: bibliography,
    searchText: `${article.content_html.replace(/<[^>]+>/g, " ")} ${bibliography.map((reference) => reference.referenceText).join(" ")}`,
  };
}

export async function getPreviewArticle(slug: string): Promise<Article | undefined> {
  const [storedArticles, storedReferences] = await Promise.all([listStoredArticles(), listPreviewReferences()]);
  const article = storedArticles.find((item) => item.slug === slug);
  return article ? storedArticleToArticle(article, storedReferences) : undefined;
}
