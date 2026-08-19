import "server-only";

import { randomUUID } from "node:crypto";
import { readPreviewDataFile, writePreviewDataFile } from "./preview-file-store";

export type StoredPublication = {
  id: string;
  reference_html: string;
  pdf_key: string | null;
  external_url: string | null;
  publication_date: string;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
};

const publicationsFilename = "publications.json";
const legacyPublicationsPath = "/tmp/academia-preview-publications.json";

async function readStore(): Promise<StoredPublication[]> {
  try {
    return JSON.parse(await readPreviewDataFile(publicationsFilename, legacyPublicationsPath)) as StoredPublication[];
  } catch {
    return [];
  }
}

async function writeStore(publications: StoredPublication[]) {
  await writePreviewDataFile(publicationsFilename, `${JSON.stringify(publications, null, 2)}\n`);
}

export async function listStoredPublications() {
  return (await readStore()).sort((a, b) =>
    b.publication_date.localeCompare(a.publication_date) || b.created_at.localeCompare(a.created_at),
  );
}

export async function saveStoredPublication(input: {
  id?: string;
  referenceHtml: string;
  pdfKey?: string;
  externalUrl?: string;
  publicationDate: string;
  status: "draft" | "published";
}) {
  const publications = await readStore();
  const index = input.id ? publications.findIndex((publication) => publication.id === input.id) : -1;
  const existing = index >= 0 ? publications[index] : undefined;
  const now = new Date().toISOString();
  const publication: StoredPublication = {
    id: existing?.id || randomUUID(),
    reference_html: input.referenceHtml,
    pdf_key: input.pdfKey || null,
    external_url: input.externalUrl || null,
    publication_date: input.publicationDate,
    status: input.status,
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  if (index >= 0) publications.splice(index, 1, publication);
  else publications.push(publication);
  await writeStore(publications);
  return publication;
}

export async function deleteStoredPublication(id: string) {
  const publications = await readStore();
  const next = publications.filter((publication) => publication.id !== id);
  if (next.length === publications.length) return false;
  await writeStore(next);
  return true;
}
