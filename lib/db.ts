import "server-only";
import { Pool } from "pg";

declare global { var academiaPool: Pool | undefined; }
export function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString && !process.env.PGHOST) throw new Error("Configuração do PostgreSQL ausente");
  if (!global.academiaPool) global.academiaPool = new Pool({
    connectionString: connectionString || undefined,
    max: Number(process.env.PGPOOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  });
  return global.academiaPool;
}

export function hasDatabaseConfig() {
  return Boolean(process.env.DATABASE_URL || process.env.PGHOST);
}
