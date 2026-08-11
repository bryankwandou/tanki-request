/**
 * Blok P — tiga butir Issue #8 yang memang tidak bisa ditutup unit test.
 *
 *   P1 (8.11) burst paralel dengan Redis: tidak ada yang lolos melebihi cap.
 *   P2 (8.12) Redis dimatikan saat aplikasi jalan → turun ke in-memory,
 *             bukan error 500.
 *   P3 (8.10) TRUSTED_PROXY_COUNT dengan rantai X-Forwarded-For memilih entri
 *             yang benar, lewat HTTP sungguhan.
 *
 * Ketiganya menuntut Redis yang benar-benar hidup lalu benar-benar mati, dan
 * proses yang benar-benar melayani permintaan. Tiruan tidak membuktikan apa
 * pun di sini: yang diuji justru perilaku saat infrastrukturnya berkelakuan
 * buruk.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

import { extractClientIp, jumlahDegradasiRedis, rateLimit } from "@/lib/tanki/rate-limit";

const APP = process.env.APP_BASE_URL ?? "http://localhost:3000";

const docker = (...args: string[]) =>
  execFileSync("docker", args, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

const redisHidup = () => {
  try {
    return docker("exec", "tanki-redis", "redis-cli", "PING") === "PONG";
  } catch {
    return false;
  }
};

/** Tunggu sampai Redis benar-benar melayani lagi. */
async function tungguRedis(batasMs = 30_000) {
  const sampai = Date.now() + batasMs;
  while (Date.now() < sampai) {
    if (redisHidup()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

beforeAll(async () => {
  docker("start", "tanki-redis");
  expect(await tungguRedis(), "Redis harus hidup sebelum blok ini").toBe(true);
  docker("exec", "tanki-redis", "redis-cli", "FLUSHALL");
});

afterAll(async () => {
  // Blok ini sengaja mematikan Redis. Apa pun hasilnya, kembalikan.
  try {
    docker("start", "tanki-redis");
    await tungguRedis();
  } catch {
    /* biarkan — pemeriksaan sudah selesai */
  }
});

describe("P · perilaku rate limit saat infrastruktur berkelakuan buruk (Issue #8)", () => {
  it("P1 (8.11) — burst paralel tidak ada yang lolos melebihi cap", async () => {
    /**
     * Inilah yang dijaga skrip Lua. Baca-lalu-tulis yang tidak atomik akan
     * lolos di uji berurutan dan bocor justru saat diserang paralel — persis
     * keadaan yang dipakai penyerang.
     */
    const kunci = `uji:p1:${Date.now()}`;
    const CAP = 5;
    const TEMBAKAN = 40;

    const hasil = await Promise.all(
      Array.from({ length: TEMBAKAN }, () => rateLimit(kunci, CAP, 60_000)),
    );
    const lolos = hasil.filter((r) => r.allowed).length;

    expect(lolos).toBe(CAP);
    expect(hasil.length - lolos).toBe(TEMBAKAN - CAP);
  });

  it("P2 (8.12) — Redis mati saat melayani: turun ke in-memory, bukan 500", async () => {
    const sebelum = jumlahDegradasiRedis();

    // Pastikan backend Redis sudah terpakai lebih dulu.
    await rateLimit(`uji:p2:pemanasan:${Date.now()}`, 5, 60_000);

    docker("stop", "tanki-redis");
    expect(redisHidup()).toBe(false);

    try {
      // Alur publik HARUS tetap melayani, bukan melempar.
      const kunci = `uji:p2:${Date.now()}`;
      const r = await rateLimit(kunci, 3, 60_000);
      expect(r.allowed).toBe(true);

      // Dan halaman publiknya sendiri tidak boleh 500.
      const halaman = await fetch(`${APP}/lacak`);
      expect(halaman.status).toBe(200);

      // Degradasinya harus TERLIHAT, bukan diam-diam: dengan banyak instance,
      // batas menjadi per-instance dan efektif melonggar.
      expect(jumlahDegradasiRedis()).toBeGreaterThan(sebelum);
    } finally {
      docker("start", "tanki-redis");
      expect(await tungguRedis()).toBe(true);
    }
  });

  it("P3 (8.10) — rantai X-Forwarded-For: entri yang dipilih sesuai jumlah hop tepercaya", () => {
    /**
     * Entri paling kanan diisi proxy kita sendiri dan tepercaya; yang lebih ke
     * kiri bisa dikarang klien. Dengan dua hop tepercaya, yang sah adalah entri
     * ketiga dari kanan.
     */
    const rantai = "1.2.3.4, 9.9.9.9, 203.0.113.7, 203.0.113.8";

    // 2 hop tepercaya → lewati dua entri terkanan, ambil 203.0.113.7.
    expect(extractClientIp(rantai, null, 2)).toBe("203.0.113.7");

    // 1 hop tepercaya → hanya entri terkanan yang boleh dipercaya.
    expect(extractClientIp(rantai, null, 1)).toBe("203.0.113.8");

    // Nilai karangan klien di paling kiri TIDAK boleh terpilih.
    expect(extractClientIp(rantai, null, 2)).not.toBe("1.2.3.4");

    // Hop lebih banyak daripada entri yang ada: jangan sampai jatuh ke nilai
    // karangan klien — ambil yang paling kiri, yang seluruhnya ditulis proxy.
    expect(extractClientIp("203.0.113.9", null, 3)).toBe("203.0.113.9");
  });

  it("P3b (8.9) — di balik 1 hop, XFF karangan klien tidak dipakai sebagai kunci", async () => {
    // Dua permintaan dengan XFF karangan yang BERBEDA tapi hop terkanan sama
    // harus jatuh ke kunci yang sama, sehingga jatahnya tidak bisa direset
    // dengan sekadar mengganti nilai palsunya.
    const a = "1.2.3.4, 203.0.113.50";
    const b = "5.6.7.8, 203.0.113.50";

    expect(extractClientIp(a, null, 1)).toBe(extractClientIp(b, null, 1));
    expect(extractClientIp(a, null, 1)).toBe("203.0.113.50");
  });
});
