type RateLimitEntry = {
  count: number;
  resetAt: number;
  blockedUntil: number;
  lastSeenAt: number;
};

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  blockMs?: number;
};

declare global {
  var academiaRateLimits: Map<string, RateLimitEntry> | undefined;
  var academiaRateLimitLastPruneAt: number | undefined;
}

const MAX_RATE_LIMIT_ENTRIES = 10_000;
const RATE_LIMIT_PRUNE_THRESHOLD = 2_000;
const RATE_LIMIT_PRUNE_INTERVAL_MS = 60_000;

function pruneRateLimits(rates: Map<string, RateLimitEntry>, now: number) {
  for (const [key, entry] of rates) {
    if (entry.resetAt <= now && entry.blockedUntil <= now) rates.delete(key);
  }
  if (rates.size < MAX_RATE_LIMIT_ENTRIES) return;

  const oldest = [...rates.entries()]
    .sort((left, right) => left[1].lastSeenAt - right[1].lastSeenAt)
    .slice(0, Math.max(1, rates.size - MAX_RATE_LIMIT_ENTRIES + 1));
  for (const [key] of oldest) rates.delete(key);
}

function normalizeAddress(value: string | null) {
  const address = value?.split(",")[0]?.trim() || "unknown";
  return address.replace(/[^a-fA-F0-9:.[\]-]/g, "").slice(0, 80) || "unknown";
}

export function requestAddress(request: Request) {
  // Em produção, somente o Nginx pode alcançar a aplicação e ele sempre
  // sobrescreve este cabeçalho. Cabeçalhos enviados diretamente pelo cliente,
  // inclusive os da Cloudflare, não participam da identidade do limitador.
  return normalizeAddress(request.headers.get("x-real-ip"));
}

export function consumeRateLimit(bucket: string, identity: string, options: RateLimitOptions) {
  const now = Date.now();
  const rates = global.academiaRateLimits || new Map<string, RateLimitEntry>();
  global.academiaRateLimits = rates;

  const lastPruneAt = global.academiaRateLimitLastPruneAt || 0;
  if (
    rates.size >= MAX_RATE_LIMIT_ENTRIES
    || (rates.size >= RATE_LIMIT_PRUNE_THRESHOLD && now - lastPruneAt >= RATE_LIMIT_PRUNE_INTERVAL_MS)
  ) {
    pruneRateLimits(rates, now);
    global.academiaRateLimitLastPruneAt = now;
  }

  const key = `${bucket}:${identity}`;
  const current = rates.get(key);
  if (current?.blockedUntil && current.blockedUntil > now) {
    current.lastSeenAt = now;
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.blockedUntil - now) / 1000)) };
  }

  const entry = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + options.windowMs, blockedUntil: 0, lastSeenAt: now }
    : current;
  entry.count += 1;
  entry.lastSeenAt = now;

  if (entry.count > options.limit) {
    entry.blockedUntil = now + (options.blockMs || options.windowMs);
    rates.set(key, entry);
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000)) };
  }

  rates.set(key, entry);
  return { allowed: true, retryAfter: 0 };
}

export function clearRateLimit(bucket: string, identity: string) {
  global.academiaRateLimits?.delete(`${bucket}:${identity}`);
}

function canonicalOrigin(request: Request) {
  const publicUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (publicUrl) {
    try {
      return new URL(publicUrl).origin;
    } catch {
      return null;
    }
  }

  // O endereço da própria requisição é suficiente no desenvolvimento. Em
  // produção, NEXT_PUBLIC_SITE_URL é obrigatório e validado na inicialização.
  if (process.env.NODE_ENV !== "production") {
    try {
      return new URL(request.url).origin;
    } catch {
      return null;
    }
  }
  return null;
}

export function isSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    const expectedOrigin = canonicalOrigin(request);
    return Boolean(expectedOrigin && expectedOrigin === new URL(origin).origin);
  } catch {
    return false;
  }
}

export function crossOriginMutationResponse(request: Request) {
  if (isSameOriginMutation(request)) return null;
  return Response.json(
    { error: "Origem da solicitação não permitida." },
    { status: 403, headers: { "cache-control": "private, no-store, max-age=0" } },
  );
}
