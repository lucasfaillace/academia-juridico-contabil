import assert from "node:assert/strict";
import test from "node:test";

import { referenceListParameters } from "../lib/reference-query.ts";

test("limita a paginação e o volume de identificadores das referências", () => {
  const ids = Array.from({ length: 120 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
  const parameters = referenceListParameters(`https://example.test/api/references?page=-2&pageSize=999&ids=${ids.join(",")}`);
  assert.equal(parameters.page, 1);
  assert.equal(parameters.pageSize, 100);
  assert.equal(parameters.ids.length, 100);
});

test("descarta identificadores inválidos e limita termos de pesquisa", () => {
  const parameters = referenceListParameters(
    `https://example.test/api/references?q=${"a".repeat(300)}&fichamentoQ=${"b".repeat(700)}&topicIds=invalido,00000000-0000-4000-8000-000000000001`,
  );
  assert.equal(parameters.query.length, 200);
  assert.equal(parameters.fichamentoQuery.length, 500);
  assert.deepEqual(parameters.topicIds, ["00000000-0000-4000-8000-000000000001"]);
});
