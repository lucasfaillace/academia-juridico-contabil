function requireValue(name, minimumLength = 1) {
  const value = process.env[name]?.trim() || "";
  if (value.length < minimumLength) {
    throw new Error(`${name} não está configurada corretamente.`);
  }
  return value;
}

function validateProductionEnvironment() {
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
  if (!/^scrypt\$\d+\$\d+\$\d+\$[^$]+\$[^$]+$/.test(passwordHash)) {
    throw new Error("ADMIN_PASSWORD_HASH não é um hash scrypt válido.");
  }
}

try {
  validateProductionEnvironment();
  await import("../server.js");
} catch (error) {
  console.error("Falha na inicialização:", error instanceof Error ? error.message : "erro desconhecido");
  process.exit(1);
}
