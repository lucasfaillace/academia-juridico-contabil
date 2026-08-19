import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const password = process.env.ADMIN_PASSWORD_INPUT || process.argv[2];
if (!password || password.length < 12) { console.error("Informe uma senha com pelo menos 12 caracteres."); process.exit(1); }
const scrypt = promisify(scryptCallback);
const options = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const salt = randomBytes(24).toString("base64url");
const derived = await scrypt(password, salt, 64, options);
console.log(`scrypt$${options.N}$${options.r}$${options.p}$${salt}$${Buffer.from(derived).toString("base64url")}`);
