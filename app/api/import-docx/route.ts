import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import mammoth from "mammoth";
import sanitizeHtml from "sanitize-html";
import { verifySession } from "@/lib/auth";
import {
  DOCX_IMPORT_LIMITS,
  inspectDocxArchive,
  UnsafeDocxError,
  validateEmbeddedImage,
} from "@/lib/docx-security";
import { crossOriginMutationResponse } from "@/lib/request-security";

export const runtime = "nodejs";
const MAX_MULTIPART_BYTES = DOCX_IMPORT_LIMITS.maxCompressedBytes + 1024 * 1024;
const DOCX_CONTENT_TYPES = new Set([
  "",
  "application/octet-stream",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function POST(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await verifySession((await cookies()).get("academia_session")?.value))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const declaredLength = Number.parseInt(request.headers.get("content-length") || "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
    return NextResponse.json({ error: "O envio excede o limite permitido para a importação." }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "O formulário de importação é inválido." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)
    || file.size === 0
    || file.size > DOCX_IMPORT_LIMITS.maxCompressedBytes
    || !file.name.toLowerCase().endsWith(".docx")
    || !DOCX_CONTENT_TYPES.has(file.type.toLowerCase())) {
    return NextResponse.json({ error: "Envie um arquivo .docx válido de até 15 MiB." }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return NextResponse.json({ error: "O conteúdo do arquivo não corresponde a um documento .docx." }, { status: 400 });
  try {
    const inspection = inspectDocxArchive(buffer);
    let convertedImageCount = 0;
    let convertedImageBytes = 0;
    let imageViolation: UnsafeDocxError | undefined;
    const result = await mammoth.convertToHtml({ buffer }, {
      externalFileAccess: false,
      includeEmbeddedStyleMap: false,
      convertImage: mammoth.images.imgElement(async (image) => {
        try {
          const data = await image.read();
          convertedImageCount += 1;
          convertedImageBytes += data.byteLength;
          if (convertedImageCount > DOCX_IMPORT_LIMITS.maxImages || convertedImageCount > inspection.imageCount) {
            throw new UnsafeDocxError(`O documento deve conter no máximo ${DOCX_IMPORT_LIMITS.maxImages} imagens.`);
          }
          if (convertedImageBytes > DOCX_IMPORT_LIMITS.maxTotalImageBytes || convertedImageBytes > inspection.imageBytes) {
            throw new UnsafeDocxError("O tamanho real das imagens excede o limite verificado do documento.");
          }
          const contentType = validateEmbeddedImage(data, image.contentType);
          return { src: `data:${contentType};base64,${data.toString("base64")}` };
        } catch (error) {
          imageViolation = error instanceof UnsafeDocxError
            ? error
            : new UnsafeDocxError("Não foi possível verificar uma imagem incorporada ao documento.");
          throw imageViolation;
        }
      }),
    });
    if (imageViolation) throw imageViolation;
    if (result.value.length > DOCX_IMPORT_LIMITS.maxHtmlCharacters) {
      throw new UnsafeDocxError("O texto convertido excede o limite de 2 milhões de caracteres do editor.");
    }
    const clean = sanitizeHtml(result.value, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "sup", "sub", "u"]),
      allowedAttributes: { a: ["href", "name", "id"], img: ["src", "alt", "title"], "*": ["id"] },
      allowedSchemes: ["http", "https", "mailto"],
      allowedSchemesByTag: { img: ["data"] },
      transformTags: {
        a: (_tagName, attributes) => ({ tagName: "a", attribs: { ...attributes, rel: "noopener noreferrer" } }),
        img: (_tagName, attributes) => {
          const safe = /^data:image\/(?:jpeg|png|webp);base64,/i.test(attributes.src || "");
          return { tagName: "img", attribs: safe ? attributes : {} };
        },
      },
    });
    if (clean.length > DOCX_IMPORT_LIMITS.maxHtmlCharacters) {
      throw new UnsafeDocxError("O texto convertido excede o limite de 2 milhões de caracteres do editor.");
    }
    return NextResponse.json({ html: clean, messages: result.messages.map((item) => item.message) });
  } catch (error) {
    if (error instanceof UnsafeDocxError) return NextResponse.json({ error: error.message }, { status: 422 });
    console.warn("docx_import_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível converter o documento. O arquivo foi rejeitado com segurança." }, { status: 422 });
  }
}
