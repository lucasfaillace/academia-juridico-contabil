import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const previewDirectory = process.env.PREVIEW_DATA_DIR?.trim()
  ? path.resolve(process.env.PREVIEW_DATA_DIR)
  : path.join(process.cwd(), "storage", "preview");

function safeFilename(filename: string) {
  if (path.basename(filename) !== filename || !/^[a-z0-9][a-z0-9._-]*\.json$/i.test(filename)) {
    throw new Error("invalid_preview_data_filename");
  }
  return filename;
}

function destination(filename: string) {
  return path.join(previewDirectory, safeFilename(filename));
}

export async function readPreviewDataFile(filename: string, legacyPath?: string) {
  const target = destination(filename);
  try {
    return await readFile(target, "utf8");
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT" || !legacyPath) throw error;
  }

  const legacyContent = await readFile(legacyPath, "utf8");
  await writePreviewDataFile(filename, legacyContent);
  return legacyContent;
}

export async function writePreviewDataFile(filename: string, content: string) {
  await mkdir(previewDirectory, { recursive: true, mode: 0o700 });
  const target = destination(filename);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, target);
}

export function previewDataDirectory() {
  return previewDirectory;
}
