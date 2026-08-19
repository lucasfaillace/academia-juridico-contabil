import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getStorage } from "@/lib/storage";
import { crossOriginMutationResponse } from "@/lib/request-security";

export const runtime = "nodejs";

const MAX_PDF_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  const token = (await cookies()).get("academia_session")?.value;
  if (!(await verifySession(token))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const formData = await request.formData();
  const upload = formData.get("pdf");
  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "Selecione um arquivo PDF." }, { status: 400 });
  }
  if (upload.size === 0 || upload.size > MAX_PDF_SIZE) {
    return NextResponse.json({ error: "O PDF deve ter no máximo 20 MB." }, { status: 400 });
  }
  if (upload.type !== "application/pdf") {
    return NextResponse.json({ error: "O arquivo deve estar no formato PDF." }, { status: 400 });
  }
  const buffer = Buffer.from(await upload.arrayBuffer());
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return NextResponse.json({ error: "O arquivo não corresponde a um PDF válido." }, { status: 400 });
  }

  const key = await getStorage().saveOriginal("publicacao.pdf", buffer);
  return NextResponse.json({ key }, { status: 201 });
}
