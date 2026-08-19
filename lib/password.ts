import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
const keyLength = 64;
const options = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: string, customOptions = options) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, customOptions, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string) {
  if (password.length < 12) throw new Error("A senha precisa ter pelo menos 12 caracteres");
  const salt = randomBytes(24).toString("base64url");
  const derived = await derive(password, salt);
  return `scrypt$${options.N}$${options.r}$${options.p}$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, n, r, p, salt, encoded] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !encoded) return false;
  const expected = Buffer.from(encoded, "base64url");
  if (expected.length !== keyLength) return false;
  const actual = await derive(password, salt, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(actual, expected);
}
