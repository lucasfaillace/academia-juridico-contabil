/**
 * Rate limiting em memória simples para produção pequeña.
 * Para escala maior, considere Redis.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Limpar entries expiradas a cada 5 minutos
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt < now) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

export function rateLimit(
  identifier: string,
  options: {
    limit: number;
    windowMs: number; // em milissegundos
  }
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const key = identifier;

  let entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + options.windowMs,
    };
    store.set(key, entry);
  }

  const allowed = entry.count < options.limit;
  entry.count++;

  return {
    allowed,
    remaining: Math.max(0, options.limit - entry.count),
    resetIn: entry.resetAt - now,
  };
}
