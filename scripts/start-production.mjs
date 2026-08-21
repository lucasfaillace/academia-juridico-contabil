import { pathToFileURL } from "node:url";

function requireValue(name, minimumLength = 1) {
  const value = process.env[name]?.trim() || "";
  if (value.length < minimumLength) {
    throw new Error(`${name} não está configurada corretamente.`);
  }
  return value;
}

function validScryptHash(value) {
  const parts = value.split("$");
  if (parts.length !== 6) return false;
  const [algorithm, n, r, p, salt, encoded] = parts;
  if (algorithm !== "scrypt" || n !== "16384" || r !== "8" || p !== "1") return false;
  if (!/^[A-Za-z0-9_-]{24,}$/.test(salt) || !/^[A-Za-z0-9_-]+$/.test(encoded)) return false;
  try {
    return Buffer.from(encoded, "base64url").length === 64;
  } catch {
    return false;
  }
}

export function validateProductionEnvironment() {
  const siteUrl = new URL(requireValue("NEXT_PUBLIC_SITE_URL"));
  const localHost = ["localhost", "127.0.0.1"].includes(siteUrl.hostname);
  if (siteUrl.protocol !== "https:" && !localHost) {
    throw new Error("NEXT_PUBLIC_SITE_URL deve usar HTTPS fora do ambiente local.");
  }

  requireValue("AUTH_SECRET", 32);
  requireValue("ANALYTICS_HASH_SECRET", 32);
  requireValue("PGHOST");
  requireValue("PGDATABASE");
  requireValue("PGUSER");
  requireValue("PGPASSWORD");

  const adminEmail = requireValue("ADMIN_EMAIL");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new Error("ADMIN_EMAIL não é um endereço válido.");
  }

  const passwordHash = requireValue("ADMIN_PASSWORD_HASH");
  if (!validScryptHash(passwordHash)) {
    throw new Error("ADMIN_PASSWORD_HASH não é um hash scrypt válido.");
  }
}

async function main() {
  try {
    validateProductionEnvironment();
    if (process.argv.includes("--validate-only")) return;
    await import("../server.js");
  } catch (error) {
    console.error("Falha na inicialização:", error instanceof Error ? error.message : "erro desconhecido");
    process.exitCode = 1;
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryUrl) await main();
