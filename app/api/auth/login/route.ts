import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, sessionMaxAge } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
const schema = z.object({ email: z.email(), password: z.string().min(8).max(200) });
export async function POST(request: Request) { const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 }); const expectedEmail = process.env.ADMIN_EMAIL; const hash = process.env.ADMIN_PASSWORD_HASH; if (!expectedEmail || !hash || parsed.data.email.toLowerCase() !== expectedEmail.toLowerCase() || !(await verifyPassword(parsed.data.password, hash))) return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 }); const response = NextResponse.json({ ok: true }); response.cookies.set("academia_session", createSession(parsed.data.email), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: sessionMaxAge }); return response; }
