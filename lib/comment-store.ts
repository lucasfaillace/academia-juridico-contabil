import "server-only";

import { randomUUID } from "node:crypto";
import { readPreviewDataFile, writePreviewDataFile } from "./preview-file-store";

export type StoredComment = {
  id: string;
  article_slug: string;
  parent_id: string | null;
  author_name: string;
  body: string;
  is_admin: boolean;
  status: "published" | "hidden";
  created_at: string;
};

const previewCommentsFilename = "comments.json";
const legacyPreviewCommentsPath = "/tmp/academia-preview-comments.json";

async function readComments(): Promise<StoredComment[]> {
  try {
    const comments = JSON.parse(await readPreviewDataFile(previewCommentsFilename, legacyPreviewCommentsPath)) as StoredComment[];
    return comments.map((comment) => ({ ...comment, status: comment.status || "published" }));
  } catch {
    return [];
  }
}

export async function listPreviewComments(articleSlug: string) {
  return (await readComments())
    .filter((comment) => comment.article_slug === articleSlug && comment.status === "published")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function listAllPreviewComments() {
  return (await readComments()).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function writeComments(comments: StoredComment[]) {
  await writePreviewDataFile(previewCommentsFilename, `${JSON.stringify(comments, null, 2)}\n`);
}

export async function updatePreviewComment(id: string, body: string) {
  const comments = await readComments();
  const comment = comments.find((item) => item.id === id);
  if (!comment) throw new Error("Comentário não encontrado.");
  comment.body = body;
  await writeComments(comments);
  return comment;
}

export async function deletePreviewComment(id: string) {
  const comments = await readComments();
  if (!comments.some((comment) => comment.id === id)) throw new Error("Comentário não encontrado.");
  const deletedIds = new Set([id]);
  let foundChild = true;
  while (foundChild) {
    foundChild = false;
    for (const comment of comments) {
      if (comment.parent_id && deletedIds.has(comment.parent_id) && !deletedIds.has(comment.id)) {
        deletedIds.add(comment.id);
        foundChild = true;
      }
    }
  }
  await writeComments(comments.filter((comment) => !deletedIds.has(comment.id)));
  return deletedIds.size;
}

export async function deletePreviewCommentsForArticle(articleSlug: string) {
  const comments = await readComments();
  const remaining = comments.filter((comment) => comment.article_slug !== articleSlug);
  if (remaining.length !== comments.length) await writeComments(remaining);
  return comments.length - remaining.length;
}

export async function savePreviewComment(input: {
  articleSlug: string;
  parentId?: string;
  authorName: string;
  body: string;
  isAdmin: boolean;
}) {
  const comments = await readComments();
  if (input.parentId && !comments.some((comment) => comment.id === input.parentId && comment.article_slug === input.articleSlug)) {
    throw new Error("Comentário de origem não encontrado.");
  }
  const comment: StoredComment = {
    id: randomUUID(),
    article_slug: input.articleSlug,
    parent_id: input.parentId || null,
    author_name: input.authorName,
    body: input.body,
    is_admin: input.isAdmin,
    status: "published",
    created_at: new Date().toISOString(),
  };
  comments.push(comment);
  await writeComments(comments);
  return comment;
}
