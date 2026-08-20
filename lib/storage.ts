import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface StorageAdapter {
  saveOriginal(name: string, data: Buffer): Promise<string>;
  readOriginal(key: string): Promise<Buffer>;
  deleteOriginal(key: string): Promise<boolean>;
}
class LocalStorageAdapter implements StorageAdapter {
  private originalPath(key: string) {
    if (path.basename(key) !== key) throw new Error("invalid_storage_key");
    return path.join(process.cwd(), "storage", "uploads", key);
  }

  async saveOriginal(name: string, data: Buffer) {
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const key = `${randomUUID()}-${safeName}`;
    const directory = path.join(process.cwd(), "storage", "uploads");
    await mkdir(directory, { recursive: true });
    await writeFile(this.originalPath(key), data, { flag: "wx" });
    return key;
  }

  async readOriginal(key: string) {
    return readFile(this.originalPath(key));
  }

  async deleteOriginal(key: string) {
    try {
      await unlink(this.originalPath(key));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
}
export function getStorage(): StorageAdapter { return new LocalStorageAdapter(); }
