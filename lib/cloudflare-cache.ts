import "server-only";

type PurgeOptions = {
  paths?: string[];
  prefixes?: string[];
};

type CloudflareResult = {
  success?: boolean;
  errors?: Array<{ message?: string }>;
};

function configuration() {
  if (process.env.CLOUDFLARE_CACHE_PURGE_ENABLED !== "true") return null;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!zoneId || !token || !siteUrl) {
    console.warn("cloudflare_cache_purge_disabled", "Configuração opcional incompleta.");
    return null;
  }
  try {
    return { zoneId, token, site: new URL(siteUrl) };
  } catch {
    console.warn("cloudflare_cache_purge_disabled", "NEXT_PUBLIC_SITE_URL inválida.");
    return null;
  }
}

async function sendPurge(zoneId: string, token: string, body: Record<string, string[]>) {
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const result = await response.json().catch(() => ({})) as CloudflareResult;
    if (!response.ok || result.success !== true) {
      console.warn("cloudflare_cache_purge_failed", response.status, result.errors?.map((item) => item.message).filter(Boolean).join("; ") || "unknown");
    }
  } catch (error) {
    console.warn("cloudflare_cache_purge_failed", error instanceof Error ? error.message : "unknown");
  }
}

export async function purgeOptionalCloudflareCache({ paths = [], prefixes = [] }: PurgeOptions) {
  const config = configuration();
  if (!config) return;

  const files = [...new Set(paths)]
    .filter((path) => path.startsWith("/") && !path.includes("["))
    .map((path) => new URL(path, config.site).toString());
  const normalizedPrefixes = [...new Set(prefixes)]
    .filter((path) => path.startsWith("/"))
    .map((path) => `${config.site.host}${path}`);

  if (files.length) await sendPurge(config.zoneId, config.token, { files: files.slice(0, 100) });
  if (normalizedPrefixes.length) await sendPurge(config.zoneId, config.token, { prefixes: normalizedPrefixes.slice(0, 30) });
}
