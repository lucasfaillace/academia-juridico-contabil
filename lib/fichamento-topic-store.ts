import "server-only";

import { randomUUID } from "node:crypto";
import { readPreviewDataFile, writePreviewDataFile } from "./preview-file-store";

export type StoredFichamentoTopic = {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: string;
  updatedAt: string;
};

const previewTopicsFilename = "fichamento-topics.json";
const legacyPreviewTopicsPath = "/tmp/academia-preview-fichamento-topics.json";

export function normalizeFichamentoTopic(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

async function writeTopics(topics: StoredFichamentoTopic[]) {
  await writePreviewDataFile(previewTopicsFilename, `${JSON.stringify(topics, null, 2)}\n`);
}

export async function listPreviewFichamentoTopics() {
  try {
    const topics = JSON.parse(await readPreviewDataFile(previewTopicsFilename, legacyPreviewTopicsPath)) as StoredFichamentoTopic[];
    return topics.sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  } catch {
    return [];
  }
}

export async function createPreviewFichamentoTopic(name: string) {
  const topics = await listPreviewFichamentoTopics();
  const normalizedName = normalizeFichamentoTopic(name);
  const existing = topics.find((topic) => topic.normalizedName === normalizedName);
  if (existing) return existing;
  const now = new Date().toISOString();
  const topic: StoredFichamentoTopic = {
    id: randomUUID(),
    name,
    normalizedName,
    createdAt: now,
    updatedAt: now,
  };
  topics.push(topic);
  await writeTopics(topics);
  return topic;
}

export async function updatePreviewFichamentoTopic(id: string, name: string) {
  const topics = await listPreviewFichamentoTopics();
  const index = topics.findIndex((topic) => topic.id === id);
  if (index < 0) throw new Error("Tema não encontrado.");
  const normalizedName = normalizeFichamentoTopic(name);
  if (topics.some((topic) => topic.id !== id && topic.normalizedName === normalizedName)) {
    throw new Error("Já existe um tema com esse nome.");
  }
  topics[index] = {
    ...topics[index],
    name,
    normalizedName,
    updatedAt: new Date().toISOString(),
  };
  await writeTopics(topics);
  return topics[index];
}

export async function deletePreviewFichamentoTopic(id: string) {
  const topics = await listPreviewFichamentoTopics();
  const topic = topics.find((candidate) => candidate.id === id);
  if (!topic) throw new Error("Tema não encontrado.");
  await writeTopics(topics.filter((candidate) => candidate.id !== id));
  return topic;
}
