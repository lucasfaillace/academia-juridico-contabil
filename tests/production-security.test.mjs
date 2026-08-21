import assert from "node:assert/strict";
import test from "node:test";
import { isSameOriginMutation, requestAddress } from "../lib/request-security.ts";
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

test("aceita somente a origem pública canônica em mutações de produção", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousPublicUrl = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "https://academia.example.invalid";

    const valid = new Request("http://127.0.0.1:3000/api/contact", {
      method: "POST",
      headers: { origin: "https://academia.example.invalid" },
    });
    assert.equal(isSameOriginMutation(valid), true);

    const forged = new Request("http://127.0.0.1:3000/api/contact", {
      method: "POST",
      headers: {
        origin: "https://forjada.example.invalid",
        "x-forwarded-host": "forjada.example.invalid",
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(isSameOriginMutation(forged), false);
    assert.equal(isSameOriginMutation(new Request("http://127.0.0.1:3000/api/contact", { method: "POST" })), false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousPublicUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousPublicUrl;
  }
});

test("usa somente o endereço normalizado pelo proxy confiável", () => {
  const request = new Request("http://127.0.0.1:3000/api/contact", {
    headers: {
      "x-real-ip": "198.51.100.7",
      "x-forwarded-for": "203.0.113.50",
      "cf-connecting-ip": "203.0.113.60",
    },
  });
  assert.equal(requestAddress(request), "198.51.100.7");

  const untrustedOnly = new Request("http://127.0.0.1:3000/api/contact", {
    headers: {
      "x-forwarded-for": "203.0.113.50",
      "cf-connecting-ip": "203.0.113.60",
    },
  });
  assert.equal(requestAddress(untrustedOnly), "unknown");
});
