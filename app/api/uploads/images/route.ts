import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getStorage } from "@/lib/storage";
import { crossOriginMutationResponse } from "@/lib/request-security";
import { processArticleImage } from "@/lib/image-processing";

export const runtime = "nodejs";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const imageTypes = {
  "image/jpeg": { extension: "jpg", signatures: [[0xff, 0xd8, 0xff]] },
  "image/png": { extension: "png", signatures: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
  "image/webp": { extension: "webp", signatures: [[0x52, 0x49, 0x46, 0x46]] },
} as const;

function startsWith(buffer: Buffer, signature: readonly number[]) {
  return signature.every((byte, index) => buffer[index] === byte);
}

function isValidImage(buffer: Buffer, type: keyof typeof imageTypes) {
  if (!imageTypes[type].signatures.some((signature) => startsWith(buffer, signature))) return false;
  if (type === "image/webp") return buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return true;
}

export async function POST(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  const token = (await cookies()).get("academia_session")?.value;
  if (!verifySession(token)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const formData = await request.formData();
  const upload = formData.get("image");
  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "Selecione uma imagem." }, { status: 400 });
  }
  if (upload.size === 0 || upload.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: "A imagem deve ter no máximo 8 MB." }, { status: 400 });
  }
  if (!(upload.type in imageTypes)) {
    return NextResponse.json({ error: "Use uma imagem JPG, PNG ou WebP." }, { status: 400 });
  }

  const type = upload.type as keyof typeof imageTypes;
  const buffer = Buffer.from(await upload.arrayBuffer());
  if (!isValidImage(buffer, type)) {
    return NextResponse.json({ error: "O arquivo não corresponde a uma imagem válida." }, { status: 400 });
  }

  try {
    const { desktop, mobile } = await processArticleImage(buffer);

    const storage = getStorage();
    const [desktopKey, mobileKey] = await Promise.all([
      storage.saveOriginal("imagem-desktop.webp", desktop.data),
      storage.saveOriginal("imagem-mobile.webp", mobile.data),
    ]);

    return NextResponse.json({
      url: `/media/${encodeURIComponent(desktopKey)}`,
      mobileUrl: `/media/${encodeURIComponent(mobileKey)}`,
      width: desktop.width,
      height: desktop.height,
      mobileWidth: mobile.width,
      mobileHeight: mobile.height,
      format: "webp",
    }, { status: 201 });
  } catch (error) {
    console.warn("image_processing_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "A imagem não pôde ser processada com segurança." }, { status: 400 });
  }
}
