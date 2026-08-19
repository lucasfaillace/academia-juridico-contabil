import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { z } from "zod";
import { consumeRateLimit, crossOriginMutationResponse, requestAddress } from "@/lib/request-security";

const schema = z.object({ name: z.string().min(2).max(120), email: z.email().max(180), subject: z.string().min(3).max(180), message: z.string().min(20).max(5000), consent: z.literal("true"), website: z.string().max(0).optional() });
export async function POST(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  const rate = consumeRateLimit("contact", requestAddress(request), { limit: 5, windowMs: 60 * 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: "Muitas tentativas" }, { status: 429, headers: { "retry-after": String(rate.retryAfter) } });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  if (!process.env.SMTP_HOST || !process.env.CONTACT_TO) { if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Envio não configurado" }, { status: 503 }); return NextResponse.json({ ok: true, mode: "development" }); }
  try { const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined }); await transport.sendMail({ from: process.env.CONTACT_FROM || process.env.SMTP_USER, to: process.env.CONTACT_TO, replyTo: parsed.data.email, subject: `[Site] ${parsed.data.subject}`, text: `Nome: ${parsed.data.name}\nE-mail: ${parsed.data.email}\n\n${parsed.data.message}` }); return NextResponse.json({ ok: true }); } catch (error) { console.error("contact_send_failed", error instanceof Error ? error.message : "unknown"); return NextResponse.json({ error: "Falha no envio" }, { status: 502 }); }
}
