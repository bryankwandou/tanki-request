// Rate limiter berbasis in-memory sliding window (anti-bot/spam, FR-08).
// Multi-instance production: set REDIS_URL → otomatis pakai Redis (Upstash/ioredis compatible).
// Single-instance / Vercel single-region: falls back to bounded LRU in-memory store.
import { LRUCache } from "lru-cache";

export type RateResult = { allowed: boolean; remaining: number; retryAfterMs: number };

// ---------------------------------------------------------------------------
// Trusted-proxy-aware IP extraction
// Set TRUSTED_PROXY_COUNT=1 (default) for Vercel/single reverse proxy.
// Set TRUSTED_PROXY_COUNT=2 for double-proxy setups, etc.
// ---------------------------------------------------------------------------
const TRUSTED_PROXY_COUNT = Math.max(
  1,
  Number(process.env.TRUSTED_PROXY_COUNT ?? "1") || 1,
);

export function extractClientIp(xff: string | null, realIp: string | null): string {
  if (xff) {
    const ips = xff.split(",").map((s) => s.trim()).filter(Boolean);
    // The rightmost `TRUSTED_PROXY_COUNT` entries are added by trusted proxies.
    // The first entry *before* those is the actual client IP.
    const untrustedIndex = ips.length - TRUSTED_PROXY_COUNT - 1;
    if (untrustedIndex >= 0) return ips[untrustedIndex];
    // Fewer hops than trusted proxies — take the leftmost (internal network)
    return ips[0] ?? "unknown";
  }
  return realIp ?? "unknown";
}

// ---------------------------------------------------------------------------
// Store backend — Redis if REDIS_URL is set, bounded LRU otherwise
// ---------------------------------------------------------------------------
type Backend = {
  get(key: string): Promise<number[]>;
  set(key: string, hits: number[]): Promise<void>;
  del(key: string): Promise<void>;
};

// In-memory LRU backend (bounded, evicts LRU when > 5000 keys)
const lru = new LRUCache<string, number[]>({ max: 5000 });
const memBackend: Backend = {
  async get(key) { return lru.get(key) ?? []; },
  async set(key, hits) { lru.set(key, hits); },
  async del(key) { lru.delete(key); },
};

// Redis backend — lazy-loaded to avoid import errors when REDIS_URL is absent
let _redisBackend: Backend | null = null;

async function getBackend(): Promise<Backend> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return memBackend;

  if (_redisBackend) return _redisBackend;

  try {
    // Dynamic import so build does not fail if `ioredis` is not installed
    const { default: Redis } = await import("ioredis");
    const client = new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false });
    await client.connect().catch(() => null);

    _redisBackend = {
      async get(key) {
        const raw = await client.get(key);
        return raw ? (JSON.parse(raw) as number[]) : [];
      },
      async set(key, hits) {
        // TTL = 2 hours max to auto-evict idle keys
        await client.set(key, JSON.stringify(hits), "EX", 7200);
      },
      async del(key) {
        await client.del(key);
      },
    };
    return _redisBackend;
  } catch {
    // Redis unavailable → fall back to LRU silently
    return memBackend;
  }
}

// ---------------------------------------------------------------------------
// Core rate limit function — async, backend-agnostic sliding window
// ---------------------------------------------------------------------------
export async function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<RateResult> {
  const backend = await getBackend();
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (await backend.get(key)).filter((t) => t > cutoff);

  if (hits.length >= max) {
    const retryAfterMs = hits[0] + windowMs - now;
    await backend.set(key, hits);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  hits.push(now);
  if (hits.length === 0) {
    await backend.del(key);
  } else {
    await backend.set(key, hits);
  }
  return { allowed: true, remaining: max - hits.length, retryAfterMs: 0 };
}
