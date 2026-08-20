import pg from "pg";

if (!process.env.DATABASE_URL && !process.env.PGHOST) {
  throw new Error("Configuração do PostgreSQL ausente");
}

const batchArgument = process.argv.find((argument) => argument.startsWith("--batch-size="));
const batchSize = Number(batchArgument?.split("=")[1] ?? 5000);
if (!Number.isInteger(batchSize) || batchSize < 100 || batchSize > 50_000) {
  throw new Error("--batch-size deve ser um inteiro entre 100 e 50000");
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL || undefined,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});

let cleaned = 0;
await client.connect();
try {
  while (true) {
    const result = await client.query(
      `WITH expired AS (
         SELECT id
         FROM article_views
         WHERE dedupe_key IS NOT NULL
           AND viewed_at < NOW() - INTERVAL '48 hours'
         ORDER BY viewed_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE article_views AS view
       SET dedupe_key=NULL
       FROM expired
       WHERE view.id=expired.id
       RETURNING view.id`,
      [batchSize],
    );
    cleaned += result.rowCount || 0;
    if ((result.rowCount || 0) < batchSize) break;
  }
} finally {
  await client.end();
}

console.log(`Chaves temporárias removidas: ${cleaned}`);
