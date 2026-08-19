import "server-only";

import { getPool, hasDatabaseConfig } from "./db";
import { readPreviewDataFile, writePreviewDataFile } from "./preview-file-store";
import { usesFileContentFallback } from "./preview-store";

export type AnalyticsSettings = {
  enabled: boolean;
  measurementId: string;
  source: "database" | "preview" | "environment" | "disabled";
};

const settingsKey = "google_analytics_4";
const previewFilename = "analytics-settings.json";
const measurementIdPattern = /^G-[A-Z0-9]+$/i;

function normalize(value: unknown, source: AnalyticsSettings["source"]): AnalyticsSettings | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { enabled?: unknown; measurementId?: unknown };
  const measurementId = typeof candidate.measurementId === "string"
    ? candidate.measurementId.trim().toUpperCase()
    : "";
  const enabled = candidate.enabled === true && measurementIdPattern.test(measurementId);
  return { enabled, measurementId, source };
}

function environmentSettings(): AnalyticsSettings {
  const measurementId = (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "").trim().toUpperCase();
  if (!measurementIdPattern.test(measurementId)) {
    return { enabled: false, measurementId: "", source: "disabled" };
  }
  return { enabled: true, measurementId, source: "environment" };
}

export function validAnalyticsMeasurementId(value: string) {
  return measurementIdPattern.test(value.trim());
}

export async function getAnalyticsSettings(): Promise<AnalyticsSettings> {
  if (hasDatabaseConfig()) {
    const result = await getPool().query("SELECT value FROM settings WHERE key=$1", [settingsKey]);
    if (result.rowCount) {
      return normalize(result.rows[0].value, "database")
        || { enabled: false, measurementId: "", source: "database" };
    }
  } else if (usesFileContentFallback()) {
    try {
      const stored = normalize(JSON.parse(await readPreviewDataFile(previewFilename)), "preview");
      if (stored) return stored;
    } catch {
      // A ausência do arquivo mantém o fallback de ambiente.
    }
  }
  return environmentSettings();
}

export async function saveAnalyticsSettings(input: { enabled: boolean; measurementId: string }) {
  const measurementId = input.measurementId.trim().toUpperCase();
  const value = { enabled: input.enabled, measurementId };
  if (hasDatabaseConfig()) {
    await getPool().query(
      `INSERT INTO settings(key,value,updated_at)
       VALUES ($1,$2::jsonb,NOW())
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,
      [settingsKey, JSON.stringify(value)],
    );
    return { ...value, source: "database" as const };
  }
  if (usesFileContentFallback()) {
    await writePreviewDataFile(previewFilename, `${JSON.stringify(value, null, 2)}\n`);
    return { ...value, source: "preview" as const };
  }
  throw new Error("Persistência da configuração do Google Analytics indisponível.");
}

