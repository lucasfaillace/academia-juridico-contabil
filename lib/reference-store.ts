import "server-only";

import { randomUUID } from "node:crypto";
import { normalizeReferenceText, referenceSimilarity } from "./bibliographic-references";
import { readPreviewDataFile, writePreviewDataFile } from "./preview-file-store";

export type StoredBibliographicReference = {
  id: string;
  referenceText: string;
  referenceHtml: string;
  normalizedText: string;
  createdAt: string;
  updatedAt: string;
};

const previewReferencesFilename = "bibliographic-references.json";
const legacyPreviewReferencesPath = "/tmp/academia-preview-bibliographic-references.json";

async function writeReferences(references: StoredBibliographicReference[]) {
  await writePreviewDataFile(previewReferencesFilename, `${JSON.stringify(references, null, 2)}\n`);
}

export async function listPreviewReferences() {
  try {
    const references = JSON.parse(await readPreviewDataFile(previewReferencesFilename, legacyPreviewReferencesPath)) as StoredBibliographicReference[];
    return references
      .map((reference) => ({
        ...reference,
        referenceHtml: reference.referenceHtml || "",
      }))
      .sort((a, b) => a.referenceText.localeCompare(b.referenceText, "pt-BR"));
  } catch {
    return [];
  }
}

export function similarPreviewReferences(referenceText: string, references: StoredBibliographicReference[], excludedId?: string) {
  return references
    .filter((reference) => reference.id !== excludedId)
    .map((reference) => ({ ...reference, similarity: referenceSimilarity(referenceText, reference.referenceText) }))
    .filter((reference) => reference.similarity >= 0.72)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
}

export async function createPreviewReference(referenceText: string, referenceHtml: string) {
  const references = await listPreviewReferences();
  const normalizedText = normalizeReferenceText(referenceText);
  if (references.some((reference) => reference.normalizedText === normalizedText)) {
    throw new Error("Esta referência já está cadastrada.");
  }
  const now = new Date().toISOString();
  const reference: StoredBibliographicReference = {
    id: randomUUID(),
    referenceText,
    referenceHtml,
    normalizedText,
    createdAt: now,
    updatedAt: now,
  };
  references.push(reference);
  await writeReferences(references);
  return reference;
}

export async function updatePreviewReference(id: string, referenceText: string, referenceHtml: string) {
  const references = await listPreviewReferences();
  const index = references.findIndex((reference) => reference.id === id);
  if (index < 0) throw new Error("Referência não encontrada.");
  const normalizedText = normalizeReferenceText(referenceText);
  if (references.some((reference) => reference.id !== id && reference.normalizedText === normalizedText)) {
    throw new Error("Esta referência já está cadastrada.");
  }
  references[index] = { ...references[index], referenceText, referenceHtml, normalizedText, updatedAt: new Date().toISOString() };
  await writeReferences(references);
  return references[index];
}

export async function deletePreviewReference(id: string) {
  const references = await listPreviewReferences();
  const reference = references.find((item) => item.id === id);
  if (!reference) throw new Error("Referência não encontrada.");
  await writeReferences(references.filter((item) => item.id !== id));
  return reference;
}
