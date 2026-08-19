import { NextResponse } from "next/server";
import { createSession, sessionMaxAge } from "@/lib/auth";

export const runtime = "nodejs";

function isLocalPreview(request: Request) {
  const hostname = new URL(request.url).hostname;
  return process.env.NODE_ENV !== "production" && ["127.0.0.1", "localhost", "::1"].includes(hostname);
}

export async function GET(request: Request) {
  if (!isLocalPreview(request)) return new NextResponse("Não encontrado.", { status: 404 });

  // Preserve o host usado pelo navegador (localhost, 127.0.0.1 ou ::1).
  // Um endereço absoluto pode ser normalizado pelo servidor de desenvolvimento
  // e fazer o cookie da sessão ficar associado a outro host.
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: "/admin" },
  });
  response.cookies.set("academia_session", createSession("preview-local@academia.local"), {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: sessionMaxAge,
  });
  return response;
}
