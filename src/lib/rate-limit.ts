/**
 * In-memory sliding-window rate limiter (spec §118).
 * Protects login / signup / join / sync endpoints from brute force.
 * For multi-instance deployments swap the store with Redis/Upstash.
 */

interface Bucket {
  hits: number[];
}

const store = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = store.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0] ?? now;
    store.set(key, bucket);
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  bucket.hits.push(now);
  store.set(key, bucket);

  // opportunistic cleanup so the map cannot grow unbounded
  if (store.size > 5000) {
    for (const [k, b] of store) {
      b.hits = b.hits.filter((t) => now - t < windowMs);
      if (b.hits.length === 0) store.delete(k);
    }
  }

  return { ok: true, remaining: limit - bucket.hits.length, retryAfterSeconds: 0 };
}

export const LIMITS = {
  /** brute-force protection for credential checks (keyed by IP + login id) */
  login: { limit: 12, windowMs: 10 * 60_000 },
  signup: { limit: 6, windowMs: 60 * 60_000 },
  join: { limit: 8, windowMs: 60 * 60_000 },
  /** normal data entry — keyed per session, generous enough for bulk grid saves */
  write: { limit: 900, windowMs: 60_000 },
  sync: { limit: 30, windowMs: 60_000 },
  export: { limit: 60, windowMs: 60_000 },
} as const;

/** How many buckets are currently tracked (diagnostics only). */
export function rateLimitSize(): number {
  return store.size;
}

/**
 * Clear every bucket. Test/ops aid only — exposed through
 * POST /api/dev/reset-rate-limits, which is disabled unless the caller is an
 * authenticated platform admin or presents RATE_LIMIT_RESET_SECRET.
 */
export function resetRateLimits(): number {
  const cleared = store.size;
  store.clear();
  return cleared;
}
