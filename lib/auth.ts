import { createHmac, timingSafeEqual } from "node:crypto";

const maxAge = 60 * 60 * 8;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET precisa conter pelo menos 32 caracteres em produção.");
  }
  return "development-only-change-me";
}

export function createSession(email: string) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + maxAge })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
export function verifySession(token?: string) {
  if (!token) return false;
  const [payload, signature] = token.split("."); if (!payload || !signature) return false;
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { email?: unknown; exp?: unknown };
    return typeof data.email === "string"
      && typeof data.exp === "number"
      && Number.isFinite(data.exp)
      && data.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}
export const sessionMaxAge = maxAge;
