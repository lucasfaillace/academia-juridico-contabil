import "server-only";

import { randomUUID } from "node:crypto";
import type { ArticleTag } from "./content";
import { readPreviewDataFile, writePreviewDataFile } from "./preview-file-store";
import { listStoredArticles, removeStoredTag, replaceStoredTag } from "./preview-store";

export type StoredTag = Required<Pick<ArticleTag, "name" | "slug" | "kind">> & { id: string };

const previewTagsFilename = "tags.json";
const legacyPreviewTagsPath = "/tmp/academia-preview-tags.json";

export function slugifyTag(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function writeTags(tags: StoredTag[]) {
  await writePreviewDataFile(previewTagsFilename, `${JSON.stringify(tags, null, 2)}\n`);
}

async function seedTags() {
  const tags = new Map<string, StoredTag>();
  for (const article of await listStoredArticles()) {
    for (const tag of article.tags || []) {
      const slug = tag.slug || slugifyTag(tag.name);
      if (slug && !tags.has(slug)) tags.set(slug, { id: tag.id || randomUUID(), name: tag.name, slug, kind: tag.kind });
    }
  }
  const seeded = Array.from(tags.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  await writeTags(seeded);
  return seeded;
}

export async function listPreviewTags(): Promise<StoredTag[]> {
  try {
    const tags = JSON.parse(await readPreviewDataFile(previewTagsFilename, legacyPreviewTagsPath)) as StoredTag[];
    return tags.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  } catch {
    return seedTags();
  }
}

export async function createPreviewTag(input: Pick<StoredTag, "name" | "kind">) {
  const tags = await listPreviewTags();
  const slug = slugifyTag(input.name);
  if (!slug || tags.some((tag) => tag.slug === slug || tag.name.toLocaleLowerCase("pt-BR") === input.name.toLocaleLowerCase("pt-BR"))) {
    throw new Error("Já existe uma tag com esse nome.");
  }
  const tag: StoredTag = { id: randomUUID(), name: input.name, slug, kind: input.kind };
  tags.push(tag);
  await writeTags(tags);
  return tag;
}

export async function updatePreviewTag(id: string, input: Pick<StoredTag, "name" | "kind">) {
  const tags = await listPreviewTags();
  const index = tags.findIndex((tag) => tag.id === id);
  if (index < 0) throw new Error("Tag não encontrada.");
  const slug = slugifyTag(input.name);
  if (!slug || tags.some((tag) => tag.id !== id && (tag.slug === slug || tag.name.toLocaleLowerCase("pt-BR") === input.name.toLocaleLowerCase("pt-BR")))) {
    throw new Error("Já existe uma tag com esse nome.");
  }
  const previous = tags[index];
  const tag: StoredTag = { ...previous, ...input, slug };
  tags[index] = tag;
  await writeTags(tags);
  await replaceStoredTag(previous.slug, tag);
  return tag;
}

export async function deletePreviewTag(id: string) {
  const tags = await listPreviewTags();
  const tag = tags.find((item) => item.id === id);
  if (!tag) throw new Error("Tag não encontrada.");
  await writeTags(tags.filter((item) => item.id !== id));
  await removeStoredTag(tag.slug);
  return tag;
}
