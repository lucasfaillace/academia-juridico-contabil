import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { readJsonBody } from "../lib/request-json.ts";

const apiRoot = new URL("../app/api/", import.meta.url);

test("lê um corpo JSON válido", async () => {
  const request = new Request("http://localhost/api/teste", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nome: "Academia" }),
  });

  assert.deepEqual(await readJsonBody(request), { nome: "Academia" });
});

test("converte JSON malformado ou vazio em entrada inválida", async () => {
  const malformed = new Request("http://localhost/api/teste", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"nome":',
  });
  const empty = new Request("http://localhost/api/teste", { method: "POST" });

  assert.equal(await readJsonBody(malformed), null);
  assert.equal(await readJsonBody(empty), null);
});

test("rotas JSON usam o leitor seguro compartilhado", async () => {
  const entries = await readdir(apiRoot, { recursive: true, withFileTypes: true });
  const routeFiles = entries
    .filter((entry) => entry.isFile() && entry.name === "route.ts")
    .map((entry) => pathToFileURL(join(entry.parentPath, entry.name)));

  const offenders = [];
  for (const routeFile of routeFiles) {
    const source = await readFile(routeFile, "utf8");
    if (/request\.json\s*\(/.test(source)) offenders.push(routeFile.pathname);
  }

  assert.deepEqual(offenders, [], `Rotas com parsing JSON direto: ${offenders.join(", ")}`);
});
