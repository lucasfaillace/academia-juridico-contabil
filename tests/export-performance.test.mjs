import assert from "node:assert/strict";
import test from "node:test";

import { strToU8, unzipSync } from "fflate";
import {
  articleExportLimit,
  fichamentoExportLimit,
  referenceExportLimit,
} from "../lib/export-limits.ts";
import { createStreamingZip } from "../lib/streaming-zip.ts";

test("usa limites seguros quando a configuração de exportação é inválida", () => {
  const previous = {
    articles: process.env.MAX_BULK_ARTICLE_EXPORT,
    references: process.env.MAX_REFERENCE_EXPORT,
    fichamentos: process.env.MAX_FICHAMENTO_EXPORT,
  };
  process.env.MAX_BULK_ARTICLE_EXPORT = "0";
  process.env.MAX_REFERENCE_EXPORT = "não-numérico";
  process.env.MAX_FICHAMENTO_EXPORT = "100001";
  try {
    assert.equal(articleExportLimit(), 200);
    assert.equal(referenceExportLimit(), 2000);
    assert.equal(fichamentoExportLimit(), 5000);
  } finally {
    for (const [key, value] of Object.entries({
      MAX_BULK_ARTICLE_EXPORT: previous.articles,
      MAX_REFERENCE_EXPORT: previous.references,
      MAX_FICHAMENTO_EXPORT: previous.fichamentos,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("produz ZIP válido progressivamente sem recomprimir os DOCX", async () => {
  const archive = await new Response(createStreamingZip([
    { filename: "primeiro.docx", data: async () => strToU8("primeiro") },
    { filename: "segundo.docx", data: async () => strToU8("segundo") },
  ])).arrayBuffer();
  const files = unzipSync(new Uint8Array(archive));
  assert.equal(new TextDecoder().decode(files["primeiro.docx"]), "primeiro");
  assert.equal(new TextDecoder().decode(files["segundo.docx"]), "segundo");
});
