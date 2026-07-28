// Rate limiter sliding-window (anti-bot/spam, FR-08).
//
// Backend:
//   - REDIS_URL diset  → Redis sorted-set, satu Lua script per hit (atomik, aman multi-instance)
//   - tidak diset      → LRU in-memory berbatas (single instance / dev)
//
// Redis mati BUKAN alasan form publik ikut mati: setiap operasi backend dibungkus
// try/catch dan turun (degrade) ke in-memory, bukan melempar 500 ke pengguna.
import { LRUCache } from "lru-cache";

export type RateResult = { allowed: boolean; remaining: number; retryAfterMs: number };

// ---------------------------------------------------------------------------
// Resolusi IP klien di belakang reverse proxy
// ---------------------------------------------------------------------------

/**
 * Berapa hop proxy tepercaya di depan aplikasi.
 * Vercel / satu Nginx = 1. CDN + Nginx = 2.
 * Nilai non-numerik atau < 1 diperlakukan sebagai 1 (bukan NaN).
 */
export function trustedProxyCount(
  raw: string | undefined = process.env.TRUSTED_PROXY_COUNT,
): number {
  const n = Number(raw ?? "");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/**
 * Ambil IP klien yang benar-benar otentik dari X-Forwarded-For.
 *
 * Nginx `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` MENAMBAHKAN
 * `$remote_addr` di ujung KANAN nilai kiriman klien. Jadi untuk N proxy tepercaya,
 * entri otentik paling kiri berada di index `panjang - N`:
 *
 *   XFF "1.2.3.4, 203.0.113.9"                 N=1 → index 1 → 203.0.113.9  (bukan 1.2.3.4)
 *   XFF "1.2.3.4, 198.51.100.7, 203.0.113.9"   N=2 → index 1 → 198.51.100.7
 *
 * Apa pun yang dikirim klien selalu berada di sebelah KIRI batas itu, sehingga
 * tidak bisa dipakai untuk memalsukan identitas bucket rate limit.
 */
export function extractClientIp(
  xff: string | null,
  realIp: string | null,
  proxies: number = trustedProxyCount(),
): string {
  const hops = Number.isFinite(proxies) && proxies >= 1 ? Math.floor(proxies) : 1;

  if (xff) {
    const ips = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (ips.length > 0) {
      const authenticIndex = ips.length - hops;
      // Hop lebih sedikit dari yang diharapkan (mis. Vercel yang menimpa XFF):
      // seluruh entri ditulis proxy tepercaya, jadi yang paling kiri sudah aman.
      return ips[authenticIndex >= 0 ? authenticIndex : 0];
    }
  }

  return realIp?.trim() || "unknown";
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------
type Backend = {
  hit(key: string, max: number, windowMs: number): Promise<RateResult>;
};

// --- In-memory: LRU berbatas 5000 key.
// Key kedaluwarsa hilang sendiri lewat TTL sepanjang window, jadi tidak perlu
// (dan tidak mungkin) menghapus manual "saat daftar hit kosong" — daftar yang
// kosong berarti key-nya memang sudah tidak ada lagi.
const lru = new LRUCache<string, number[]>({ max: 5000, ttl: 60 * 60_000 });

const memBackend: Backend = {
  async hit(key, max, windowMs) {
    const now = Date.now();
    const cutoff = now - windowMs;
    const hits = (lru.get(key) ?? []).filter((t) => t > cutoff);

    if (hits.length >= max) {
      lru.set(key, hits, { ttl: windowMs });
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, hits[0] + windowMs - now) };
    }

    hits.push(now);
    lru.set(key, hits, { ttl: windowMs });
    return { allowed: true, remaining: max - hits.length, retryAfterMs: 0 };
  },
};

// --- Redis: satu sorted set per key, seluruh sliding window dalam satu Lua script.
// Tanpa ini, get→filter→set adalah read-modify-write: saat burst (justru kondisi
// yang jadi target limiter) N request membaca list yang sama dan semuanya lolos.
const SLIDING_WINDOW_LUA = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max    = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)

if count >= max then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  redis.call('PEXPIRE', key, window)
  return { 0, 0, math.floor(tonumber(oldest[2]) + window - now) }
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return { 1, max - count - 1, 0 }
`;

type RedisLike = {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
};

function makeRedisBackend(client: RedisLike): Backend {
  return {
    async hit(key, max, windowMs) {
      const now = Date.now();
      const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;
      const raw = (await client.eval(
        SLIDING_WINDOW_LUA,
        1,
        key,
        now,
        windowMs,
        max,
        member,
      )) as [number, number, number];

      return {
        allowed: raw[0] === 1,
        remaining: Math.max(0, raw[1]),
        retryAfterMs: Math.max(0, raw[2]),
      };
    },
  };
}

// Backend Redis hanya di-cache SETELAH connect benar-benar berhasil. Kalau gagal,
// pasang cooldown supaya tiap request tidak memicu percobaan koneksi baru.
let _redis: Backend | null = null;
let _redisRetryAt = 0;
let _redisConnecting: Promise<Backend | null> | null = null;
const REDIS_RETRY_COOLDOWN_MS = 30_000;

async function connectRedis(url: string): Promise<Backend | null> {
  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    // Sengaja tanpa .catch() — kegagalan connect HARUS sampai ke catch di bawah,
    // supaya backend yang rusak tidak ikut ter-cache.
    await client.connect();
    client.on("error", () => {
      // Jangan biarkan error koneksi jadi unhandled dan menjatuhkan proses.
      // Kegagalan per-operasi sudah ditangani di rateLimit().
    });
    return makeRedisBackend(client as unknown as RedisLike);
  } catch {
    return null;
  }
}

async function getBackend(): Promise<Backend> {
  const url = process.env.REDIS_URL;
  if (!url) return memBackend;
  if (_redis) return _redis;
  if (Date.now() < _redisRetryAt) return memBackend;

  _redisConnecting ??= connectRedis(url).finally(() => {
    _redisConnecting = null;
  });

  const backend = await _redisConnecting;
  if (backend) {
    _redis = backend;
    return backend;
  }

  _redisRetryAt = Date.now() + REDIS_RETRY_COOLDOWN_MS;
  return memBackend;
}

// ---------------------------------------------------------------------------
// API publik
// ---------------------------------------------------------------------------
export async function rateLimit(key: string, max: number, windowMs: number): Promise<RateResult> {
  const backend = await getBackend();
  try {
    return await backend.hit(key, max, windowMs);
  } catch {
    // Redis tumbang di tengah jalan → jangan jatuhkan form publik.
    // Buang backend yang rusak, layani request ini dari in-memory.
    if (backend !== memBackend) {
      _redis = null;
      _redisRetryAt = Date.now() + REDIS_RETRY_COOLDOWN_MS;
      return memBackend.hit(key, max, windowMs);
    }
    // In-memory tidak seharusnya gagal; kalau toh gagal, jangan kunci pengguna sah.
    return { allowed: true, remaining: 0, retryAfterMs: 0 };
  }
}

/** Hanya untuk test — kosongkan state in-memory antar kasus uji. */
export function __resetRateLimitStore() {
  lru.clear();
  _redis = null;
  _redisRetryAt = 0;
  _redisConnecting = null;
}
