import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-f0-9-]+-publicacao\.pdf$/i.test(key)) {
    return new NextResponse("Arquivo não encontrado.", { status: 404 });
  }
  try {
    const data = await getStorage().readOriginal(key);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="publicacao.pdf"',
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Arquivo não encontrado.", { status: 404 });
  }
}
