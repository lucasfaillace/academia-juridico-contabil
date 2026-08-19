import "server-only";

import { getPool, hasDatabaseConfig } from "./db";
import { listStoredPublications, type StoredPublication } from "./publication-store";
import { usesFileContentFallback } from "./preview-store";

export type Publication = StoredPublication;

export async function getPublishedPublications(): Promise<Publication[]> {
  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    return (await listStoredPublications()).filter((publication) => publication.status === "published");
  }
  if (!hasDatabaseConfig()) return [];
  try {
    const result = await getPool().query<Publication>(`
      SELECT id, reference_html, pdf_key, external_url,
             publication_date::text, status, created_at::text, updated_at::text
      FROM publications
      WHERE status = 'published'
      ORDER BY publication_date DESC, created_at DESC
    `);
    return result.rows;
  } catch (error) {
    console.error("published_publications_failed", error instanceof Error ? error.message : "unknown");
    return [];
  }
}
