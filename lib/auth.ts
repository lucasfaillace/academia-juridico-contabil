import { createHmac, timingSafeEqual } from "node:crypto";
import { getAdminCredential } from "./admin-credentials";

const maxAge = 60 * 60 * 8;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET precisa conter pelo menos 32 caracteres em produção.");
  }
  return "development-only-change-me";
}

export function createSession(email: string, sessionVersion: string) {
  const payload = Buffer.from(JSON.stringify({
    email,
    sessionVersion,
    exp: Math.floor(Date.now() / 1000) + maxAge,
  })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
export function readSession(token?: string) {
  if (!token) return false;
  const [payload, signature] = token.split("."); if (!payload || !signature) return false;
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      email?: unknown;
      sessionVersion?: unknown;
      exp?: unknown;
    };
    if (typeof data.email !== "string"
      || typeof data.sessionVersion !== "string"
      || typeof data.exp !== "number"
      || !Number.isFinite(data.exp)
      || data.exp <= Date.now() / 1000) return false;
    return { email: data.email, sessionVersion: data.sessionVersion, exp: data.exp };
  } catch {
    return false;
  }
}

export async function verifySession(token?: string) {
  const session = readSession(token);
  if (!session) return false;
  if (session.sessionVersion === "local-preview" && process.env.NODE_ENV !== "production") return true;
  const credential = await getAdminCredential().catch(() => null);
  return Boolean(
    credential
    && credential.email.toLocaleLowerCase("pt-BR") === session.email.toLocaleLowerCase("pt-BR")
    && credential.sessionVersion === session.sessionVersion,
  );
}
export const sessionMaxAge = maxAge;
