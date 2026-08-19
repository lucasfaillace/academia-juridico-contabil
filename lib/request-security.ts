type RateLimitEntry = {
  count: number;
  resetAt: number;
  blockedUntil: number;
};

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  blockMs?: number;
};

declare global {
  var academiaRateLimits: Map<string, RateLimitEntry> | undefined;
}

function normalizeAddress(value: string | null) {
  const address = value?.split(",")[0]?.trim() || "unknown";
  return address.replace(/[^a-fA-F0-9:.[\]-]/g, "").slice(0, 80) || "unknown";
}

export function requestAddress(request: Request) {
  return normalizeAddress(
    request.headers.get("x-real-ip")
      || request.headers.get("cf-connecting-ip")
      || request.headers.get("x-forwarded-for"),
  );
}

export function consumeRateLimit(bucket: string, identity: string, options: RateLimitOptions) {
  const now = Date.now();
  const rates = global.academiaRateLimits || new Map<string, RateLimitEntry>();
  global.academiaRateLimits = rates;

  if (rates.size > 2_000) {
    for (const [key, entry] of rates) {
      if (entry.resetAt <= now && entry.blockedUntil <= now) rates.delete(key);
    }
  }

  const key = `${bucket}:${identity}`;
  const current = rates.get(key);
  if (current?.blockedUntil && current.blockedUntil > now) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.blockedUntil - now) / 1000)) };
  }

  const entry = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + options.windowMs, blockedUntil: 0 }
    : current;
  entry.count += 1;

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

function allowedOrigins(request: Request) {
  const origins = new Set<string>();
  try {
    origins.add(new URL(request.url).origin);
  } catch {
    // A URL da Request é válida nas rotas do Next; a proteção permanece fechada se não for.
  }

  const publicUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (publicUrl) {
    try {
      origins.add(new URL(publicUrl).origin);
    } catch {
      // A validação de ambiente informará a URL pública inválida na inicialização.
    }
  }

  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost && (forwardedProto === "http" || forwardedProto === "https")) {
    origins.add(`${forwardedProto}://${forwardedHost.split(",")[0].trim()}`);
  }
  return origins;
}

export function isSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    return allowedOrigins(request).has(new URL(origin).origin);
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
