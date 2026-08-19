import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
if (!process.env.DATABASE_URL && !process.env.PGHOST) throw new Error("Configuração do PostgreSQL ausente");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL || undefined, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(7801042026)");
  await client.query("CREATE TABLE IF NOT EXISTS app_migrations (filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  const directory = path.join(process.cwd(), "migrations");
  const files = (await fs.readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await fs.readFile(path.join(directory, file), "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    const existing = await client.query("SELECT checksum FROM app_migrations WHERE filename=$1", [file]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`Migração já aplicada foi alterada: ${file}`);
      console.log(`Já aplicada: ${file}`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO app_migrations(filename,checksum) VALUES ($1,$2)", [file, checksum]);
      await client.query("COMMIT");
      console.log(`Aplicada: ${file}`);
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(7801042026)").catch(() => {});
  await client.end();
}
