/**
 * Blok B — Issue #4 (Critical), OTP. Enam item.
 *
 * Menjalankan otp.ts yang sebenarnya terhadap MySQL dan Redis yang benar-benar
 * hidup. Tidak ada mock: yang diuji justru interaksi antara state baris di
 * database, throttle di Redis, dan keputusan di otp-policy.ts.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

import { db } from "@/lib/db";
import { createPendingRequest, resendPendingOtp, verifyPendingOtp } from "@/lib/tanki/otp";
import { TOO_MANY, VERIFY_FAILED } from "@/lib/tanki/otp-policy";
import { configNumber, getConfig } from "@/lib/tanki/config";

const flushRedis = () =>
  execFileSync("docker", ["exec", "tanki-redis", "redis-cli", "FLUSHALL"]).toString().trim();

/** Nomor sambungan asli dari master pelanggan, dipakai bergilir per kasus uji. */
let nosambPool: string[] = [];
let poolIdx = 0;
const nextNosamb = () => nosambPool[poolIdx++];

let maxAttempts = 5;

async function buatPermintaan() {
  const nosamb = nextNosamb();
  const res = await createPendingRequest({
    noPelanggan: nosamb,
    noHp: "081200000001",
    email: `uji-${nosamb}@example.com`,
    keluhan: "uji integrasi blok B",
  });
  if (!res.ok) throw new Error(`gagal membuat permintaan: ${res.error}`);
  return res;
}

beforeAll(async () => {
  // Ambil nosamb yang belum punya tiket sama sekali, supaya createPendingRequest
  // tidak tertolak oleh guard "masih ada permintaan aktif".
  const rows = await db.$queryRawUnsafe<{ nosamb: string }[]>(
    `SELECT p.nosamb FROM pelanggan p
       LEFT JOIN tiket t ON t.no_pelanggan = p.nosamb
      WHERE t.id IS NULL
      LIMIT 200`,
  );
  nosambPool = rows.map((r) => r.nosamb);
  expect(nosambPool.length).toBeGreaterThan(50);

  maxAttempts = configNumber(await getConfig(), "otp_max_attempts");
});

beforeEach(() => {
  flushRedis();
});

describe("B · OTP (Issue #4)", () => {
  it("B4 — otpId adalah token 43 karakter base64url, bukan angka berurut", async () => {
    const a = await buatPermintaan();
    const b = await buatPermintaan();

    expect(a.otpId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(b.otpId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.otpId).toHaveLength(43);

    // Bukan berurut: dua permintaan berturut-turut tidak berselisih 1.
    expect(Number.isFinite(Number(a.otpId))).toBe(false);
    expect(a.otpId).not.toBe(b.otpId);

    // Dan id baris di database TIDAK sama dengan otpId yang dipegang klien.
    const row = await db.otpVerifikasi.findUnique({ where: { token: a.otpId } });
    expect(row).not.toBeNull();
    expect(String(row!.id)).not.toBe(a.otpId);
  });

  it("B1 — 5 tebakan salah, kirim ulang, tebakan ke-6 TETAP ditolak (cap tidak pulih)", async () => {
    const { otpId } = await buatPermintaan();

    for (let i = 1; i <= maxAttempts; i++) {
      const r = await verifyPendingOtp(otpId, "000000", "10.0.0.1");
      expect(r.ok).toBe(false);
    }

    let row = await db.otpVerifikasi.findUnique({ where: { token: otpId } });
    expect(row!.attempts).toBe(maxAttempts);

    // Kirim ulang: pada kode pra-perbaikan inilah `attempts` di-reset ke 0.
    // Sekarang gate menolaknya dan justru meng-EXPIRE permintaannya.
    const resend = await resendPendingOtp(otpId, "10.0.0.1");
    expect(resend.ok).toBe(false);

    row = await db.otpVerifikasi.findUnique({ where: { token: otpId } });
    expect(row!.attempts).toBe(maxAttempts); // TIDAK kembali ke 0
    expect(row!.status).toBe("EXPIRED");

    // Tebakan ke-6 tetap ditolak.
    const keenam = await verifyPendingOtp(otpId, "000000", "10.0.0.1");
    expect(keenam.ok).toBe(false);
    expect((keenam as { error: string }).error).toBe(VERIFY_FAILED);
  });

  it("B2 — kirim ulang kedua dalam 60 detik ditolak dengan hitungan mundur", async () => {
    const { otpId } = await buatPermintaan();

    // Kirim ulang pertama: lewatkan cooldown dari pembuatan dengan memundurkan
    // lastSentAt, supaya yang diuji benar-benar jeda antar KIRIM ULANG.
    await db.otpVerifikasi.update({
      where: { token: otpId },
      data: { lastSentAt: new Date(Date.now() - 120_000) },
    });
    const pertama = await resendPendingOtp(otpId, "10.0.0.2");
    expect(pertama.ok).toBe(true);

    // Kirim ulang kedua, langsung — masih di dalam 60 detik.
    const kedua = await resendPendingOtp(otpId, "10.0.0.2");
    expect(kedua.ok).toBe(false);
    expect(kedua.error).toMatch(/Mohon tunggu \d+ detik sebelum meminta kode baru\./);

    const detik = Number(kedua.error!.match(/(\d+)/)![1]);
    expect(detik).toBeGreaterThan(0);
    expect(detik).toBeLessThanOrEqual(60);
  });

  it("B3 — kirim ulang ke-4 ditolak (cap 3)", async () => {
    const { otpId } = await buatPermintaan();

    for (let i = 1; i <= 3; i++) {
      await db.otpVerifikasi.update({
        where: { token: otpId },
        data: { lastSentAt: new Date(Date.now() - 120_000) },
      });
      const r = await resendPendingOtp(otpId, `10.0.1.${i}`);
      expect(r.ok, `kirim ulang ke-${i} seharusnya lolos`).toBe(true);
    }

    let row = await db.otpVerifikasi.findUnique({ where: { token: otpId } });
    expect(row!.resendCount).toBe(3);

    // Ke-4: cooldown dilewatkan lagi supaya yang menolak benar-benar cap-nya.
    await db.otpVerifikasi.update({
      where: { token: otpId },
      data: { lastSentAt: new Date(Date.now() - 120_000) },
    });
    // Throttle per-otpId juga bercap 3; dikosongkan supaya yang teruji adalah
    // gate resendCount, bukan rate limiter.
    flushRedis();

    const keempat = await resendPendingOtp(otpId, "10.0.1.4");
    expect(keempat.ok).toBe(false);
    expect(keempat.error).toBe("Batas kirim ulang tercapai. Silakan ajukan permintaan baru.");

    row = await db.otpVerifikasi.findUnique({ where: { token: otpId } });
    expect(row!.resendCount).toBe(3); // tidak bertambah
  });

  it("B5 — enam keadaan gagal memberi pesan IDENTIK, tanpa hitungan sisa percobaan", async () => {
    const pesan: Record<string, string> = {};

    // 1. token bentuknya tidak sah (bukan 43 karakter)
    const r1 = await verifyPendingOtp("bukan-token", "000000", "10.0.2.1");
    pesan["token malformed"] = (r1 as { error: string }).error;

    // 2. token bentuknya sah tapi tidak ada di database
    const r2 = await verifyPendingOtp("A".repeat(43), "000000", "10.0.2.2");
    pesan["token tidak dikenal"] = (r2 as { error: string }).error;

    // 3. kode salah pada permintaan yang hidup
    const a = await buatPermintaan();
    const r3 = await verifyPendingOtp(a.otpId, "000000", "10.0.2.3");
    pesan["kode salah"] = (r3 as { error: string }).error;

    // 4. permintaan sudah kedaluwarsa
    const b = await buatPermintaan();
    await db.otpVerifikasi.update({
      where: { token: b.otpId },
      data: { expiredAt: new Date(Date.now() - 60_000) },
    });
    const r4 = await verifyPendingOtp(b.otpId, "000000", "10.0.2.4");
    pesan["kedaluwarsa"] = (r4 as { error: string }).error;

    // 5. cap tebakan sudah habis
    const c = await buatPermintaan();
    await db.otpVerifikasi.update({
      where: { token: c.otpId },
      data: { attempts: maxAttempts },
    });
    const r5 = await verifyPendingOtp(c.otpId, "000000", "10.0.2.5");
    pesan["cap habis"] = (r5 as { error: string }).error;

    // 6. permintaan sudah dipakai (VERIFIED)
    const d = await buatPermintaan();
    await db.otpVerifikasi.update({
      where: { token: d.otpId },
      data: { status: "VERIFIED" },
    });
    const r6 = await verifyPendingOtp(d.otpId, "000000", "10.0.2.6");
    pesan["sudah dipakai"] = (r6 as { error: string }).error;

    const unik = new Set(Object.values(pesan));
    expect(Object.keys(pesan)).toHaveLength(6);
    expect(unik.size, `pesan berbeda-beda: ${JSON.stringify(pesan, null, 2)}`).toBe(1);
    expect([...unik][0]).toBe(VERIFY_FAILED);

    // Tidak boleh ada bocoran sisa percobaan.
    for (const p of Object.values(pesan)) {
      expect(p).not.toMatch(/[Ss]isa percobaan/);
      expect(p).not.toMatch(/\d+\s*(kali|percobaan)/);
    }
  });

  it("B6 — throttle memberi pesan BERBEDA (disengaja, bukan bug)", async () => {
    const { otpId } = await buatPermintaan();

    // Habiskan throttle per-otpId (cap 10 per 10 menit).
    let pesanThrottle = "";
    for (let i = 1; i <= 15; i++) {
      const r = await verifyPendingOtp(otpId, "000000", "10.0.3.1");
      const err = (r as { error: string }).error;
      if (err === TOO_MANY) {
        pesanThrottle = err;
        break;
      }
    }

    expect(pesanThrottle).toBe(TOO_MANY);
    expect(pesanThrottle).not.toBe(VERIFY_FAILED);
  });
});
