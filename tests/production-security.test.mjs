import assert from "node:assert/strict";
import test from "node:test";
import { validateProductionEnvironment } from "../scripts/start-production.mjs";

const requiredNames = [
  "NEXT_PUBLIC_SITE_URL",
  "AUTH_SECRET",
  "ANALYTICS_HASH_SECRET",
  "PGHOST",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD_HASH",
];

function validEnvironment() {
  return {
    NEXT_PUBLIC_SITE_URL: "https://academia.example.invalid",
    AUTH_SECRET: "a".repeat(32),
    ANALYTICS_HASH_SECRET: "b".repeat(32),
    PGHOST: "db",
    PGDATABASE: "academia",
    PGUSER: "academia",
    PGPASSWORD: "senha-local-de-teste",
    ADMIN_EMAIL: "admin@example.invalid",
    ADMIN_PASSWORD_HASH: `scrypt$16384$8$1$${"c".repeat(32)}$${"A".repeat(86)}`,
  };
}

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(requiredNames.map((name) => [name, process.env[name]]));
  try {
    for (const name of requiredNames) delete process.env[name];
    Object.assign(process.env, values);
    callback();
  } finally {
    for (const name of requiredNames) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test("aceita a configuração completa de produção", () => {
  withEnvironment(validEnvironment(), () => assert.doesNotThrow(validateProductionEnvironment));
});

test("rejeita hash administrativo incompatível com o verificador", () => {
  withEnvironment(
    { ...validEnvironment(), ADMIN_PASSWORD_HASH: "scrypt$16384$8$1$sal-curto$hash-invalido" },
    () => assert.throws(validateProductionEnvironment, /hash scrypt válido/),
  );
});

test("rejeita segredos curtos e URL pública sem HTTPS", () => {
  withEnvironment(
    { ...validEnvironment(), AUTH_SECRET: "curto" },
    () => assert.throws(validateProductionEnvironment, /AUTH_SECRET/),
  );
  withEnvironment(
    { ...validEnvironment(), NEXT_PUBLIC_SITE_URL: "http://academia.example.invalid" },
    () => assert.throws(validateProductionEnvironment, /HTTPS/),
  );
});
