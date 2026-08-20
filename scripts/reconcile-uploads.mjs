import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const apply = process.argv.includes("--apply");
const minimumAgeArgument = process.argv.find((argument) => argument.startsWith("--minimum-age-hours="));
const minimumAgeHours = Number(minimumAgeArgument?.split("=")[1] ?? 24);

if (!Number.isFinite(minimumAgeHours) || minimumAgeHours < 1) {
  throw new Error("--minimum-age-hours deve ser um número igual ou superior a 1");
}
if (!process.env.DATABASE_URL && !process.env.PGHOST) {
  throw new Error("Configuração do PostgreSQL ausente");
}

const uploadsDirectory = path.join(process.cwd(), "storage", "uploads");
const referencedKeys = new Set();

function addReferencedKey(value) {
  if (typeof value !== "string" || !value || path.basename(value) !== value) return;
  referencedKeys.add(value);
}

function collectArticleMediaKeys(html) {
  if (typeof html !== "string") return;
  for (const match of html.matchAll(/\/media\/([^"'<>?\s]+)/g)) {
    try {
      addReferencedKey(decodeURIComponent(match[1]));
    } catch {
      // Uma URL inválida não pode corresponder a uma chave segura do storage.
    }
  }
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL || undefined,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});

await client.connect();
try {
  const [articles, publications] = await Promise.all([
    client.query("SELECT content_html FROM articles"),
    client.query("SELECT pdf_key FROM publications WHERE pdf_key IS NOT NULL"),
  ]);
  for (const article of articles.rows) collectArticleMediaKeys(article.content_html);
  for (const publication of publications.rows) addReferencedKey(publication.pdf_key);
} finally {
  await client.end();
}

const entries = await fs.readdir(uploadsDirectory, { withFileTypes: true }).catch((error) => {
  if (error.code === "ENOENT") return [];
  throw error;
});
const cutoff = Date.now() - minimumAgeHours * 60 * 60 * 1000;
const candidates = [];

for (const entry of entries) {
  if (!entry.isFile() || entry.name.startsWith(".") || referencedKeys.has(entry.name)) continue;
  const filePath = path.join(uploadsDirectory, entry.name);
  const metadata = await fs.stat(filePath);
  if (metadata.mtimeMs > cutoff) continue;
  candidates.push({ key: entry.name, path: filePath, bytes: metadata.size });
}

const totalBytes = candidates.reduce((sum, candidate) => sum + candidate.bytes, 0);
console.log(`Chaves referenciadas: ${referencedKeys.size}`);
console.log(`Arquivos órfãos com ao menos ${minimumAgeHours}h: ${candidates.length}`);
console.log(`Espaço recuperável: ${totalBytes} bytes`);
for (const candidate of candidates) console.log(`- ${candidate.key} (${candidate.bytes} bytes)`);

if (!apply) {
  console.log("Simulação concluída. Nenhum arquivo foi removido. Use --apply após revisar a lista e confirmar o backup.");
} else {
  for (const candidate of candidates) await fs.unlink(candidate.path);
  console.log(`Reconciliação concluída: ${candidates.length} arquivo(s) removido(s).`);
}
