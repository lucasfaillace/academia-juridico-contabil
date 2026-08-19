import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminCredential, saveAdminCredential } from "@/lib/admin-credentials";
import { verifySession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { crossOriginMutationResponse } from "@/lib/request-security";

const updateSchema = z.object({
  email: z.email().max(320),
  currentPassword: z.string().min(1).max(200),
  newPassword: z.union([z.literal(""), z.string().min(12).max(200)]),
});

async function authorized() {
  return verifySession((await cookies()).get("academia_session")?.value);
}

export async function GET() {
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const credential = await getAdminCredential().catch(() => null);
  if (!credential) {
    return NextResponse.json(
      { error: "As credenciais iniciais ainda não foram configuradas no ambiente." },
      { status: 503, headers: { "cache-control": "private, no-store, max-age=0" } },
    );
  }
  return NextResponse.json(
    { email: credential.email, source: credential.source },
    { headers: { "cache-control": "private, no-store, max-age=0" } },
  );
}

export async function PATCH(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Informe um e-mail válido e, se alterar a senha, use ao menos 12 caracteres." },
      { status: 400 },
    );
  }

  const credential = await getAdminCredential().catch(() => null);
  if (!credential || !(await verifyPassword(parsed.data.currentPassword, credential.passwordHash))) {
    return NextResponse.json({ error: "A senha atual está incorreta." }, { status: 401 });
  }

  const email = parsed.data.email.trim().toLocaleLowerCase("pt-BR");
  const emailChanged = email !== credential.email.toLocaleLowerCase("pt-BR");
  if (!emailChanged && !parsed.data.newPassword) {
    return NextResponse.json({ error: "Nenhuma alteração foi informada." }, { status: 400 });
  }

  const passwordHash = parsed.data.newPassword
    ? await hashPassword(parsed.data.newPassword)
    : credential.passwordHash;
  await saveAdminCredential(email, passwordHash);

  const response = NextResponse.json({ updated: true });
  response.headers.set("cache-control", "private, no-store, max-age=0");
  response.cookies.set("academia_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

