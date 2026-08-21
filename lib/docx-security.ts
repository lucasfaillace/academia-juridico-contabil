import { unzipSync } from "fflate";

const MIB = 1024 * 1024;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const UTF8_FILENAME_FLAG = 0x0800;
const ENCRYPTED_FLAG = 0x0001;

export type DocxSecurityLimits = {
  maxCompressedBytes: number;
  maxEntries: number;
  maxTotalUncompressedBytes: number;
  maxXmlBytes: number;
  maxCompressionRatio: number;
  maxImages: number;
  maxImageBytes: number;
  maxTotalImageBytes: number;
  maxHtmlCharacters: number;
};

export const DOCX_IMPORT_LIMITS: Readonly<DocxSecurityLimits> = Object.freeze({
  maxCompressedBytes: 15 * MIB,
  maxEntries: 1_024,
  maxTotalUncompressedBytes: 64 * MIB,
  maxXmlBytes: 16 * MIB,
  maxCompressionRatio: 100,
  maxImages: 100,
  maxImageBytes: 8 * MIB,
  maxTotalImageBytes: 32 * MIB,
  maxHtmlCharacters: 2_000_000,
});

type ArchiveEntry = {
  name: string;
  compressedBytes: number;
  uncompressedBytes: number;
  compressionMethod: number;
};

export type DocxArchiveInspection = {
  entryCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
  compressionRatio: number;
  imageCount: number;
  imageBytes: number;
};

export class UnsafeDocxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeDocxError";
  }
}

function reject(message: string): never {
  throw new UnsafeDocxError(message);
}

function findEndOfCentralDirectory(buffer: Buffer) {
  if (buffer.length < 22) reject("O arquivo não possui uma estrutura ZIP/DOCX válida.");
  const minimumOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  return reject("O arquivo não possui uma estrutura ZIP/DOCX válida.");
}

function decodeFilename(bytes: Buffer, flags: number) {
  const name = bytes.toString(flags & UTF8_FILENAME_FLAG ? "utf8" : "latin1").replaceAll("\\", "/");
  if (
    !name
    || name.includes("\0")
    || name.startsWith("/")
    || name.startsWith("//")
    || /^[a-z]:/i.test(name)
    || name.split("/").some((part) => part === "..")
  ) reject("O documento contém um caminho interno inválido.");
  return name;
}

function imageMimeFromSignature(data: Uint8Array) {
  if (data.length >= 8
    && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 12
    && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46
    && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return "image/webp";
  return "";
}

function expectedImageMime(name: string) {
  const extension = name.toLowerCase().split(".").pop();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "";
}

export function validateEmbeddedImage(
  data: Uint8Array,
  declaredContentType: string,
  limits: Readonly<DocxSecurityLimits> = DOCX_IMPORT_LIMITS,
) {
  if (data.byteLength === 0 || data.byteLength > limits.maxImageBytes) {
    return reject(`Cada imagem incorporada deve ter no máximo ${limits.maxImageBytes / MIB} MiB.`);
  }
  const detected = imageMimeFromSignature(data);
  const declared = declaredContentType.toLowerCase().split(";", 1)[0].trim();
  if (!detected || detected !== declared) {
    return reject("O documento contém uma imagem inválida ou de tipo não permitido. Use JPG, PNG ou WebP.");
  }
  return detected;
}

function readCentralDirectory(buffer: Buffer, limits: Readonly<DocxSecurityLimits>) {
  const endOffset = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const directoryDisk = buffer.readUInt16LE(endOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const directoryBytes = buffer.readUInt32LE(endOffset + 12);
  const directoryOffset = buffer.readUInt32LE(endOffset + 16);
  const commentBytes = buffer.readUInt16LE(endOffset + 20);

  if (endOffset + 22 + commentBytes !== buffer.length) reject("O final do arquivo DOCX está corrompido.");
  if (diskNumber !== 0 || directoryDisk !== 0 || entriesOnDisk !== entryCount) {
    reject("Arquivos DOCX divididos em múltiplos volumes não são aceitos.");
  }
  if (entryCount === 0xffff || directoryBytes === 0xffffffff || directoryOffset === 0xffffffff) {
    reject("Arquivos DOCX no formato ZIP64 não são aceitos.");
  }
  if (entryCount === 0 || entryCount > limits.maxEntries) {
    reject(`O documento deve conter no máximo ${limits.maxEntries} entradas internas.`);
  }
  if (directoryOffset + directoryBytes > endOffset) reject("O diretório interno do DOCX está corrompido.");

  const entries: ArchiveEntry[] = [];
  const names = new Set<string>();
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > endOffset || buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY) {
      reject("O diretório interno do DOCX está corrompido.");
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedBytes = buffer.readUInt32LE(offset + 20);
    const uncompressedBytes = buffer.readUInt32LE(offset + 24);
    const filenameBytes = buffer.readUInt16LE(offset + 28);
    const extraBytes = buffer.readUInt16LE(offset + 30);
    const entryCommentBytes = buffer.readUInt16LE(offset + 32);
    const entryDisk = buffer.readUInt16LE(offset + 34);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + filenameBytes + extraBytes + entryCommentBytes;
    if (nextOffset > endOffset) reject("O diretório interno do DOCX está truncado.");

    const name = decodeFilename(buffer.subarray(offset + 46, offset + 46 + filenameBytes), flags);
    if (names.has(name)) reject("O documento contém entradas internas duplicadas.");
    names.add(name);
    if (flags & ENCRYPTED_FLAG) reject("Documentos DOCX protegidos por senha não são aceitos.");
    if (compressedBytes === 0xffffffff || uncompressedBytes === 0xffffffff || localOffset === 0xffffffff) {
      reject("Arquivos DOCX no formato ZIP64 não são aceitos.");
    }
    if (entryDisk !== 0 || (compressionMethod !== 0 && compressionMethod !== 8)) {
      reject("O documento usa um método de compactação não permitido.");
    }
    if (localOffset + 30 > directoryOffset || buffer.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
      reject("O documento contém uma entrada interna inválida.");
    }
    const localFlags = buffer.readUInt16LE(localOffset + 6);
    const localCompression = buffer.readUInt16LE(localOffset + 8);
    const localFilenameBytes = buffer.readUInt16LE(localOffset + 26);
    const localExtraBytes = buffer.readUInt16LE(localOffset + 28);
    const payloadOffset = localOffset + 30 + localFilenameBytes + localExtraBytes;
    if ((localFlags & ENCRYPTED_FLAG) || localCompression !== compressionMethod || payloadOffset + compressedBytes > directoryOffset) {
      reject("O documento contém uma entrada interna inconsistente.");
    }

    const localName = decodeFilename(buffer.subarray(localOffset + 30, localOffset + 30 + localFilenameBytes), localFlags);
    if (localName !== name) reject("O documento contém nomes internos inconsistentes.");
    entries.push({ name, compressedBytes, uncompressedBytes, compressionMethod });
    offset = nextOffset;
  }
  if (offset !== directoryOffset + directoryBytes) reject("O tamanho do diretório interno do DOCX é inconsistente.");
  return entries;
}

export function inspectDocxArchive(
  buffer: Buffer,
  limits: Readonly<DocxSecurityLimits> = DOCX_IMPORT_LIMITS,
): DocxArchiveInspection {
  if (buffer.length === 0 || buffer.length > limits.maxCompressedBytes) {
    reject(`O arquivo DOCX compactado deve ter no máximo ${limits.maxCompressedBytes / MIB} MiB.`);
  }
  const entries = readCentralDirectory(buffer, limits);
  const required = new Set(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
  let compressedBytes = 0;
  let uncompressedBytes = 0;
  let imageBytes = 0;
  const imageEntries: ArchiveEntry[] = [];

  for (const entry of entries) {
    required.delete(entry.name);
    compressedBytes += entry.compressedBytes;
    uncompressedBytes += entry.uncompressedBytes;
    if (/\.(?:xml|rels)$/i.test(entry.name) && entry.uncompressedBytes > limits.maxXmlBytes) {
      reject(`Cada arquivo XML interno deve ter no máximo ${limits.maxXmlBytes / MIB} MiB.`);
    }
    if (/^word\/media\/[^/]+$/i.test(entry.name)) {
      if (!expectedImageMime(entry.name)) {
        reject("O documento contém uma imagem de tipo não permitido. Use JPG, PNG ou WebP.");
      }
      if (entry.uncompressedBytes === 0 || entry.uncompressedBytes > limits.maxImageBytes) {
        reject(`Cada imagem incorporada deve ter no máximo ${limits.maxImageBytes / MIB} MiB.`);
      }
      imageBytes += entry.uncompressedBytes;
      imageEntries.push(entry);
    }
  }

  if (required.size > 0) reject("O arquivo não contém a estrutura mínima de um documento Word (.docx).");
  if (uncompressedBytes > limits.maxTotalUncompressedBytes) {
    reject(`O conteúdo descompactado do documento deve ter no máximo ${limits.maxTotalUncompressedBytes / MIB} MiB.`);
  }
  const compressionRatio = compressedBytes === 0
    ? (uncompressedBytes === 0 ? 1 : Number.POSITIVE_INFINITY)
    : uncompressedBytes / compressedBytes;
  if (compressionRatio > limits.maxCompressionRatio) {
    reject(`A taxa de expansão do documento excede o limite seguro de ${limits.maxCompressionRatio}:1.`);
  }
  if (imageEntries.length > limits.maxImages) reject(`O documento deve conter no máximo ${limits.maxImages} imagens.`);
  if (imageBytes > limits.maxTotalImageBytes) {
    reject(`As imagens incorporadas devem ocupar, juntas, no máximo ${limits.maxTotalImageBytes / MIB} MiB.`);
  }

  let extracted: Record<string, Uint8Array>;
  try {
    const expectedNames = new Set(imageEntries.map((entry) => entry.name));
    extracted = unzipSync(buffer, {
      filter: (entry) => expectedNames.has(entry.name.replaceAll("\\", "/")),
    });
  } catch {
    return reject("Não foi possível verificar as imagens incorporadas ao documento.");
  }
  for (const entry of imageEntries) {
    const data = extracted[entry.name];
    if (!data || data.byteLength !== entry.uncompressedBytes) reject("Uma imagem incorporada está corrompida.");
    const detected = imageMimeFromSignature(data);
    if (!detected || detected !== expectedImageMime(entry.name)) {
      reject("O documento contém uma imagem cuja extensão não corresponde ao conteúdo real.");
    }
  }

  return {
    entryCount: entries.length,
    compressedBytes,
    uncompressedBytes,
    compressionRatio,
    imageCount: imageEntries.length,
    imageBytes,
  };
}
