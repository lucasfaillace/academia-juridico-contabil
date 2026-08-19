import "server-only";

import { randomUUID } from "node:crypto";
import { readPreviewDataFile, writePreviewDataFile } from "./preview-file-store";

export type StoredReferenceFichamento = {
  id: string;
  referenceId: string;
  literalQuote: string;
  paraphrase: string;
  location: string;
  personalNote: string;
  topicIds: string[];
  relatedFichamentoIds: string[];
  createdAt: string;
  updatedAt: string;
};

const previewFichamentosFilename = "reference-fichamentos.json";
const legacyPreviewFichamentosPath = "/tmp/academia-preview-reference-fichamentos.json";

async function writeFichamentos(items: StoredReferenceFichamento[]) {
  await writePreviewDataFile(previewFichamentosFilename, `${JSON.stringify(items, null, 2)}\n`);
}

export async function listPreviewFichamentos(referenceId?: string) {
  try {
    const items = JSON.parse(await readPreviewDataFile(previewFichamentosFilename, legacyPreviewFichamentosPath)) as Array<StoredReferenceFichamento & {
      kind?: "citacao" | "anotacao";
      content?: string;
      literalQuote?: string;
      paraphrase?: string;
    }>;
    return items
      .map((item) => ({
        ...item,
        literalQuote: item.literalQuote ?? (item.kind === "citacao" ? item.content || "" : ""),
        paraphrase: item.paraphrase ?? (item.kind === "anotacao" ? item.content || "" : ""),
        topicIds: Array.isArray(item.topicIds) ? item.topicIds : [],
        relatedFichamentoIds: Array.isArray(item.relatedFichamentoIds) ? item.relatedFichamentoIds : [],
      }))
      .filter((item) => !referenceId || item.referenceId === referenceId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export async function createPreviewFichamento(input: {
  referenceId: string;
  literalQuote: string;
  paraphrase: string;
  location: string;
  personalNote: string;
  topicIds: string[];
  relatedFichamentoIds: string[];
}) {
  const items = await listPreviewFichamentos();
  const now = new Date().toISOString();
  const item: StoredReferenceFichamento = {
    id: randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  items.push(item);
  await writeFichamentos(items);
  return item;
}

export async function updatePreviewFichamento(input: {
  id: string;
  referenceId: string;
  literalQuote: string;
  paraphrase: string;
  location: string;
  personalNote: string;
  topicIds: string[];
  relatedFichamentoIds: string[];
}) {
  const items = await listPreviewFichamentos();
  const index = items.findIndex((item) => item.id === input.id && item.referenceId === input.referenceId);
  if (index < 0) throw new Error("Registro do fichamento não encontrado.");
  items[index] = { ...items[index], ...input, updatedAt: new Date().toISOString() };
  await writeFichamentos(items);
  return items[index];
}

export async function deletePreviewFichamento(id: string, referenceId: string) {
  const items = await listPreviewFichamentos();
  const item = items.find((candidate) => candidate.id === id && candidate.referenceId === referenceId);
  if (!item) throw new Error("Registro do fichamento não encontrado.");
  await writeFichamentos(items
    .filter((candidate) => candidate.id !== id)
    .map((candidate) => ({
      ...candidate,
      relatedFichamentoIds: candidate.relatedFichamentoIds.filter((relatedId) => relatedId !== id),
    })));
  return item;
}

export async function unlinkPreviewFichamentoTopic(topicId: string) {
  const items = await listPreviewFichamentos();
  const affected = items.filter((item) => item.topicIds.includes(topicId)).length;
  await writeFichamentos(items.map((item) => ({
    ...item,
    topicIds: item.topicIds.filter((id) => id !== topicId),
  })));
  return affected;
}
