import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-f0-9-]+-imagem\.(?:jpe?g|png|webp)$/i.test(key)) {
    return new NextResponse("Arquivo não encontrado.", { status: 404 });
  }

  try {
    const data = await getStorage().readOriginal(key);
    const extension = key.split(".").pop()?.toLowerCase() || "";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "content-type": contentTypes[extension] || "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Arquivo não encontrado.", { status: 404 });
  }
}
