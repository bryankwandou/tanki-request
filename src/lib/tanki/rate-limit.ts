// Rate limiter sederhana berbasis in-memory sliding window (anti-bot/spam, FR-08).
// Cukup untuk satu instance / scaffold. Produksi multi-instance → pindah ke Redis.
import { LRUCache } from "lru-cache";

type Hit = number[]; // daftar timestamp (ms)

// Bounded store to prevent unbounded memory leak from IP spoofing
const store = new LRUCache<string, Hit>({ max: 5000 });

export type RateResult = { allowed: boolean; remaining: number; retryAfterMs: number };

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (store.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= max) {
    const retryAfterMs = hits[0] + windowMs - now;
    store.set(key, hits);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  hits.push(now);
  store.set(key, hits);
  return { allowed: true, remaining: max - hits.length, retryAfterMs: 0 };
}
