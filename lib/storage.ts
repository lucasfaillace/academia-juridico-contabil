import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface StorageAdapter {
  saveOriginal(name: string, data: Buffer): Promise<string>;
  readOriginal(key: string): Promise<Buffer>;
}
class LocalStorageAdapter implements StorageAdapter {
  async saveOriginal(name: string, data: Buffer) { const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "-"); const key = `${randomUUID()}-${safeName}`; const directory = path.join(process.cwd(), "storage", "uploads"); await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, key), data, { flag: "wx" }); return key; }
  async readOriginal(key: string) {
    if (path.basename(key) !== key) throw new Error("invalid_storage_key");
    return readFile(path.join(process.cwd(), "storage", "uploads", key));
  }
}
export function getStorage(): StorageAdapter { return new LocalStorageAdapter(); }
