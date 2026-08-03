import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetRateLimitStore,
  extractClientIp,
  rateLimit,
  trustedProxyCount,
} from "./rate-limit";

// IP asli yang ditulis oleh reverse proxy tepercaya (paling kanan).
const REAL = "203.0.113.9";
// Nilai yang dikirim penyerang di header X-Forwarded-For.
const SPOOF = "1.2.3.4";
// Hop tengah pada setup CDN + Nginx.
const EDGE = "198.51.100.7";

describe("extractClientIp — resolusi trusted proxy", () => {
  it("1 entri (Vercel menimpa XFF), N=1 → entri itu sendiri", () => {
    expect(extractClientIp(REAL, null, 1)).toBe(REAL);
  });

  it("2 entri dengan spoof (Nginx $proxy_add_x_forwarded_for), N=1 → entri paling kanan", () => {
    // Inilah bug off-by-one yang dilaporkan: kode lama mengembalikan SPOOF.
    expect(extractClientIp(`${SPOOF}, ${REAL}`, null, 1)).toBe(REAL);
    expect(extractClientIp(`${SPOOF}, ${REAL}`, null, 1)).not.toBe(SPOOF);
  });

  it("3 entri dengan N=2 (CDN + Nginx) → hop tepercaya terluar, bukan kiriman klien", () => {
    expect(extractClientIp(`${SPOOF}, ${EDGE}, ${REAL}`, null, 2)).toBe(EDGE);
  });

  it("rotasi nilai spoof tiap request TIDAK menghasilkan bucket baru", () => {
    const resolved = ["9.9.9.1", "9.9.9.2", "9.9.9.3"].map((spoof) =>
      extractClientIp(`${spoof}, ${REAL}`, null, 1),
    );
    // Ini inti Issue #5: semua request harus jatuh ke identitas yang sama.
    expect(new Set(resolved).size).toBe(1);
    expect(resolved[0]).toBe(REAL);
  });

  it("XFF lebih pendek dari jumlah proxy → ambil paling kiri, jangan out-of-bounds", () => {
    expect(extractClientIp(REAL, null, 3)).toBe(REAL);
  });

  it("tanpa XFF → pakai x-real-ip, lalu 'unknown'", () => {
    expect(extractClientIp(null, REAL)).toBe(REAL);
    expect(extractClientIp(null, null)).toBe("unknown");
    expect(extractClientIp("   ", null)).toBe("unknown");
  });

  it("TRUSTED_PROXY_COUNT salah ketik tidak boleh jatuh ke nilai penyerang", () => {
    for (const bad of [Number("satu"), Number.NaN, 0, -5, Number.POSITIVE_INFINITY]) {
      expect(extractClientIp(`${SPOOF}, ${REAL}`, null, bad)).not.toBe(SPOOF);
    }
  });

  it("trustedProxyCount() memvalidasi env, default 1", () => {
    expect(trustedProxyCount("2")).toBe(2);
    expect(trustedProxyCount("satu")).toBe(1);
    expect(trustedProxyCount(undefined)).toBe(1);
    expect(trustedProxyCount("")).toBe(1);
    expect(trustedProxyCount("0")).toBe(1);
    expect(trustedProxyCount("-3")).toBe(1);
  });
});

describe("rateLimit — sliding window in-memory", () => {
  beforeEach(() => __resetRateLimitStore());

  it("mengizinkan tepat `max` request lalu memblokir", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await rateLimit("k", 3, 60_000)).allowed).toBe(true);
    }
    const blocked = await rateLimit("k", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("key berbeda punya kuota sendiri", async () => {
    await rateLimit("a", 1, 60_000);
    expect((await rateLimit("a", 1, 60_000)).allowed).toBe(false);
    expect((await rateLimit("b", 1, 60_000)).allowed).toBe(true);
  });

  it("hit di luar window tidak dihitung", async () => {
    // window 1ms → hit sebelumnya langsung kedaluwarsa
    expect((await rateLimit("c", 1, 1)).allowed).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect((await rateLimit("c", 1, 1)).allowed).toBe(true);
  });

  it("remaining turun sesuai jumlah hit", async () => {
    expect((await rateLimit("d", 3, 60_000)).remaining).toBe(2);
    expect((await rateLimit("d", 3, 60_000)).remaining).toBe(1);
    expect((await rateLimit("d", 3, 60_000)).remaining).toBe(0);
  });

  it("REDIS_URL tidak terjangkau → degradasi ke in-memory, bukan throw", async () => {
    const prev = process.env.REDIS_URL;
    // Port yang dijamin tidak ada listener-nya.
    process.env.REDIS_URL = "redis://127.0.0.1:6399";
    try {
      const r = await rateLimit("redis-down", 2, 60_000);
      expect(r.allowed).toBe(true);
      await rateLimit("redis-down", 2, 60_000);
      // Limiter tetap bekerja lewat in-memory meski Redis mati.
      expect((await rateLimit("redis-down", 2, 60_000)).allowed).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = prev;
      __resetRateLimitStore();
    }
  }, 20_000);
});
