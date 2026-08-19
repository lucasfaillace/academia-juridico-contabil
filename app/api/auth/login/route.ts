import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, sessionMaxAge } from "@/lib/auth";
import { getAdminCredential } from "@/lib/admin-credentials";
import { verifyPassword } from "@/lib/password";
import { clearRateLimit, consumeRateLimit, isSameOriginMutation, requestAddress } from "@/lib/request-security";

const schema = z.object({ email: z.email(), password: z.string().min(8).max(200) });

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Origem da solicitação não permitida." }, { status: 403 });
  }

  const address = requestAddress(request);
  const rate = consumeRateLimit("admin-login", address, {
    limit: 5,
    windowMs: 15 * 60_000,
    blockMs: 15 * 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde antes de tentar novamente." },
      { status: 429, headers: { "retry-after": String(rate.retryAfter) } },
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const credential = await getAdminCredential().catch(() => null);
  const emailMatches = Boolean(credential)
    && parsed.data.email.toLowerCase() === credential?.email.toLowerCase();
  const passwordMatches = credential
    ? await verifyPassword(parsed.data.password, credential.passwordHash)
    : false;
  if (!emailMatches || !passwordMatches) {
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  clearRateLimit("admin-login", address);
  const response = NextResponse.json({ ok: true });
  response.headers.set("cache-control", "private, no-store, max-age=0");
  response.cookies.set("academia_session", createSession(credential!.email, credential!.sessionVersion), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAge,
  });
  return response;
}
