import { createHmac, timingSafeEqual } from "node:crypto";

const maxAge = 60 * 60 * 8;
function secret() { return process.env.AUTH_SECRET || "development-only-change-me"; }
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
  try { const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp: number }; return data.exp > Date.now() / 1000; } catch { return false; }
}
export const sessionMaxAge = maxAge;
