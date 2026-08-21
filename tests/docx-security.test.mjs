import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import {
  DOCX_IMPORT_LIMITS,
  inspectDocxArchive,
  UnsafeDocxError,
  validateEmbeddedImage,
} from "../lib/docx-security.ts";

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

function archive(extra = {}, options = {}) {
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8("<Types />"),
    "_rels/.rels": strToU8("<Relationships />"),
    "word/document.xml": strToU8("<w:document />"),
    ...extra,
  }, options));
}

function limits(overrides = {}) {
  return { ...DOCX_IMPORT_LIMITS, ...overrides };
}

test("aceita um DOCX limitado e confere as assinaturas das imagens", () => {
  const value = inspectDocxArchive(archive({ "word/media/figura.png": png }));
  assert.equal(value.entryCount, 4);
  assert.equal(value.imageCount, 1);
  assert.equal(value.imageBytes, png.byteLength);
  assert.equal(validateEmbeddedImage(png, "image/png"), "image/png");
});

test("rejeita ZIP comum que não possui a estrutura mínima de DOCX", () => {
  const value = Buffer.from(zipSync({ "arquivo.txt": strToU8("não é Word") }));
  assert.throws(() => inspectDocxArchive(value), /estrutura mínima/);
  assert.throws(() => inspectDocxArchive(Buffer.from([0x50, 0x4b])), /estrutura ZIP\/DOCX válida/);
  assert.throws(
    () => inspectDocxArchive(archive({ "../entrada.xml": strToU8("inválida") })),
    /caminho interno inválido/,
  );
});

test("rejeita quantidade excessiva de entradas antes da descompactação", () => {
  assert.throws(
    () => inspectDocxArchive(archive(), limits({ maxEntries: 2 })),
    /no máximo 2 entradas/,
  );
});

test("rejeita tamanho total descompactado excessivo", () => {
  const value = archive({ "word/extra.xml": strToU8("conteúdo".repeat(40)) }, { level: 0 });
  assert.throws(
    () => inspectDocxArchive(value, limits({ maxTotalUncompressedBytes: 100 })),
    /conteúdo descompactado/,
  );
  assert.throws(
    () => inspectDocxArchive(value, limits({ maxCompressedBytes: value.byteLength - 1 })),
    /compactado deve ter no máximo/,
  );
  assert.throws(
    () => inspectDocxArchive(value, limits({ maxXmlBytes: 100 })),
    /arquivo XML interno/,
  );
});

test("rejeita taxa de expansão anormal", () => {
  const value = archive({ "word/extra.xml": strToU8("A".repeat(20_000)) }, { level: 9 });
  assert.throws(
    () => inspectDocxArchive(value, limits({ maxCompressionRatio: 5 })),
    /taxa de expansão/,
  );
});

test("rejeita excesso de imagens e soma descompactada acima do limite", () => {
  const value = archive({
    "word/media/figura-1.png": png,
    "word/media/figura-2.png": png,
  });
  assert.throws(() => inspectDocxArchive(value, limits({ maxImages: 1 })), /no máximo 1 imagens/);
  assert.throws(
    () => inspectDocxArchive(value, limits({ maxTotalImageBytes: png.byteLength })),
    /imagens incorporadas/,
  );
  assert.throws(
    () => inspectDocxArchive(value, limits({ maxImageBytes: png.byteLength - 1 })),
    /Cada imagem incorporada/,
  );
});

test("rejeita imagem com extensão incompatível, assinatura falsa ou MIME divergente", () => {
  assert.throws(
    () => inspectDocxArchive(archive({ "word/media/figura.svg": strToU8("<svg />") })),
    /tipo não permitido/,
  );
  assert.throws(
    () => inspectDocxArchive(archive({ "word/media/figura.png": strToU8("não é PNG") })),
    /extensão não corresponde/,
  );
  assert.throws(() => validateEmbeddedImage(png, "image/jpeg"), /inválida ou de tipo não permitido/);
});

test("rejeita documento criptografado e entradas internas duplicadas", () => {
  const encrypted = archive();
  const centralOffset = encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const localOffset = encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  encrypted.writeUInt16LE(encrypted.readUInt16LE(centralOffset + 8) | 1, centralOffset + 8);
  encrypted.writeUInt16LE(encrypted.readUInt16LE(localOffset + 6) | 1, localOffset + 6);
  assert.throws(() => inspectDocxArchive(encrypted), UnsafeDocxError);

  const duplicated = archive({ "word/a.xml": strToU8("a"), "word/b.xml": strToU8("b") });
  let central = duplicated.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  let firstName;
  let secondNameOffset = -1;
  while (central >= 0) {
    const nameLength = duplicated.readUInt16LE(central + 28);
    const extraLength = duplicated.readUInt16LE(central + 30);
    const commentLength = duplicated.readUInt16LE(central + 32);
    const nameOffset = central + 46;
    const name = duplicated.subarray(nameOffset, nameOffset + nameLength).toString("utf8");
    if (name === "word/a.xml") firstName = duplicated.subarray(nameOffset, nameOffset + nameLength);
    if (name === "word/b.xml") secondNameOffset = nameOffset;
    central += 46 + nameLength + extraLength + commentLength;
    if (duplicated.readUInt32LE(central) !== 0x02014b50) break;
  }
  assert.ok(firstName);
  assert.ok(secondNameOffset > 0);
  firstName.copy(duplicated, secondNameOffset);
  assert.throws(() => inspectDocxArchive(duplicated), /duplicadas/);

  const zip64Entry = archive();
  const zip64Central = zip64Entry.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  zip64Entry.writeUInt32LE(0xffffffff, zip64Central + 24);
  assert.throws(() => inspectDocxArchive(zip64Entry), /ZIP64/);
});
