import "server-only";

import { createHash } from "node:crypto";
import { getPool, hasDatabaseConfig } from "./db";
import { readPreviewDataFile, writePreviewDataFile } from "./preview-file-store";
import { usesFileContentFallback } from "./preview-store";

type AdminCredential = {
  email: string;
  passwordHash: string;
  sessionVersion: string;
  source: "database" | "preview" | "environment";
};

type PreviewCredential = {
  email: string;
  passwordHash: string;
  sessionVersion: number;
};

const previewFilename = "admin-credentials.json";

function environmentCredential(): AdminCredential | null {
  const email = process.env.ADMIN_EMAIL?.trim();
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (!email || !passwordHash) return null;
  const version = createHash("sha256")
    .update(`${email.toLocaleLowerCase("pt-BR")}:${passwordHash}`)
    .digest("base64url")
    .slice(0, 24);
  return { email, passwordHash, sessionVersion: `env:${version}`, source: "environment" };
}

async function previewCredential(): Promise<AdminCredential | null> {
  try {
    const value = JSON.parse(await readPreviewDataFile(previewFilename)) as PreviewCredential;
    if (!value.email || !value.passwordHash || !Number.isInteger(value.sessionVersion)) return null;
    return {
      email: value.email,
      passwordHash: value.passwordHash,
      sessionVersion: `preview:${value.sessionVersion}`,
      source: "preview",
    };
  } catch {
    return null;
  }
}

export async function getAdminCredential(): Promise<AdminCredential | null> {
  if (hasDatabaseConfig()) {
    const result = await getPool().query(
      "SELECT email,password_hash,session_version FROM admin_credentials WHERE singleton=true",
    );
    if (result.rowCount) {
      const row = result.rows[0];
      return {
        email: String(row.email),
        passwordHash: String(row.password_hash),
        sessionVersion: `db:${Number(row.session_version)}`,
        source: "database",
      };
    }
  } else if (usesFileContentFallback()) {
    const stored = await previewCredential();
    if (stored) return stored;
  }
  return environmentCredential();
}

export async function saveAdminCredential(email: string, passwordHash: string): Promise<AdminCredential> {
  if (hasDatabaseConfig()) {
    const result = await getPool().query(
      `INSERT INTO admin_credentials(singleton,email,password_hash,session_version,updated_at)
       VALUES (true,$1,$2,1,NOW())
       ON CONFLICT (singleton) DO UPDATE
       SET email=EXCLUDED.email,
           password_hash=EXCLUDED.password_hash,
           session_version=admin_credentials.session_version+1,
           updated_at=NOW()
       RETURNING email,password_hash,session_version`,
      [email, passwordHash],
    );
    const row = result.rows[0];
    return {
      email: String(row.email),
      passwordHash: String(row.password_hash),
      sessionVersion: `db:${Number(row.session_version)}`,
      source: "database",
    };
  }
  if (usesFileContentFallback()) {
    const current = await previewCredential();
    const version = current?.source === "preview"
      ? Number(current.sessionVersion.replace("preview:", "")) + 1
      : 1;
    const value: PreviewCredential = { email, passwordHash, sessionVersion: version };
    await writePreviewDataFile(previewFilename, `${JSON.stringify(value, null, 2)}\n`);
    return { email, passwordHash, sessionVersion: `preview:${version}`, source: "preview" };
  }
  throw new Error("Persistência das credenciais administrativas indisponível.");
}

