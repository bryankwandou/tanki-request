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
    const { otpId, sessionSecret: rahasia } = await buatPermintaan();

    for (let i = 1; i <= maxAttempts; i++) {
      const r = await verifyPendingOtp(otpId, "000000", "10.0.0.1", rahasia);
      expect(r.ok).toBe(false);
    }

    let row = await db.otpVerifikasi.findUnique({ where: { token: otpId } });
    expect(row!.attempts).toBe(maxAttempts);

    // Kirim ulang: pada kode pra-perbaikan inilah `attempts` di-reset ke 0.
    // Sekarang gate menolaknya dan justru meng-EXPIRE permintaannya.
    const resend = await resendPendingOtp(otpId, "10.0.0.1", rahasia);
    expect(resend.ok).toBe(false);

    row = await db.otpVerifikasi.findUnique({ where: { token: otpId } });
    expect(row!.attempts).toBe(maxAttempts); // TIDAK kembali ke 0
    expect(row!.status).toBe("EXPIRED");

    // Tebakan ke-6 tetap ditolak.
    const keenam = await verifyPendingOtp(otpId, "000000", "10.0.0.1", rahasia);
    expect(keenam.ok).toBe(false);
    expect((keenam as { error: string }).error).toBe(VERIFY_FAILED);
  });

  it("B2 — kirim ulang kedua dalam 60 detik ditolak dengan hitungan mundur", async () => {
    const { otpId, sessionSecret: rahasia } = await buatPermintaan();

    // Kirim ulang pertama: lewatkan cooldown dari pembuatan dengan memundurkan
    // lastSentAt, supaya yang diuji benar-benar jeda antar KIRIM ULANG.
    await db.otpVerifikasi.update({
      where: { token: otpId },
      data: { lastSentAt: new Date(Date.now() - 120_000) },
    });
    const pertama = await resendPendingOtp(otpId, "10.0.0.2", rahasia);
    expect(pertama.ok).toBe(true);

    // Kirim ulang kedua, langsung — masih di dalam 60 detik.
    const kedua = await resendPendingOtp(otpId, "10.0.0.2", rahasia);
    expect(kedua.ok).toBe(false);
    expect(kedua.error).toMatch(/Mohon tunggu \d+ detik sebelum meminta kode baru\./);

    const detik = Number(kedua.error!.match(/(\d+)/)![1]);
    expect(detik).toBeGreaterThan(0);
    expect(detik).toBeLessThanOrEqual(60);
  });

  it("B3 — kirim ulang ke-4 ditolak (cap 3)", async () => {
    const { otpId, sessionSecret: rahasia } = await buatPermintaan();

    for (let i = 1; i <= 3; i++) {
      await db.otpVerifikasi.update({
        where: { token: otpId },
        data: { lastSentAt: new Date(Date.now() - 120_000) },
      });
      const r = await resendPendingOtp(otpId, `10.0.1.${i}`, rahasia);
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

    const keempat = await resendPendingOtp(otpId, "10.0.1.4", rahasia);
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
    const r3 = await verifyPendingOtp(a.otpId, "000000", "10.0.2.3", a.sessionSecret);
    pesan["kode salah"] = (r3 as { error: string }).error;

    // 4. permintaan sudah kedaluwarsa
    const b = await buatPermintaan();
    await db.otpVerifikasi.update({
      where: { token: b.otpId },
      data: { expiredAt: new Date(Date.now() - 60_000) },
    });
    const r4 = await verifyPendingOtp(b.otpId, "000000", "10.0.2.4", b.sessionSecret);
    pesan["kedaluwarsa"] = (r4 as { error: string }).error;

    // 5. cap tebakan sudah habis
    const c = await buatPermintaan();
    await db.otpVerifikasi.update({
      where: { token: c.otpId },
      data: { attempts: maxAttempts },
    });
    const r5 = await verifyPendingOtp(c.otpId, "000000", "10.0.2.5", c.sessionSecret);
    pesan["cap habis"] = (r5 as { error: string }).error;

    // 6. permintaan sudah dipakai (VERIFIED)
    const d = await buatPermintaan();
    await db.otpVerifikasi.update({
      where: { token: d.otpId },
      data: { status: "VERIFIED" },
    });
    const r6 = await verifyPendingOtp(d.otpId, "000000", "10.0.2.6", d.sessionSecret);
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
    const { otpId, sessionSecret: rahasia } = await buatPermintaan();

    // Habiskan throttle per-otpId (cap 10 per 10 menit).
    let pesanThrottle = "";
    for (let i = 1; i <= 15; i++) {
      const r = await verifyPendingOtp(otpId, "000000", "10.0.3.1", rahasia);
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

/**
 * Lapis kedua di atas capability token (pertanyaan terbuka reviewer di Issue #4:
 * "apakah ownership check berbasis cookie sesi tetap perlu?").
 *
 * Skenario yang diuji: token BOCOR — lewat Referer, log proxy, riwayat peramban,
 * atau layar yang terlihat orang lain — tapi cookie HttpOnly-nya tidak ikut.
 */
describe("B7 · pengikatan sesi lewat cookie HttpOnly (Issue #4)", () => {
  it("token yang bocor TANPA cookie tidak bisa menebak kode", async () => {
    const { otpId } = await buatPermintaan();

    const penyerang = await verifyPendingOtp(otpId, "000000", "10.9.0.1");
    expect(penyerang.ok).toBe(false);
    // Pesannya sama dengan kegagalan lain — tidak jadi oracle "token ini hidup".
    expect((penyerang as { error: string }).error).toBe(VERIFY_FAILED);
  });

  it("token yang bocor dengan cookie SALAH juga ditolak", async () => {
    const { otpId } = await buatPermintaan();
    const lain = await buatPermintaan(); // secret milik permintaan orang lain

    const r = await verifyPendingOtp(otpId, "000000", "10.9.0.2", lain.sessionSecret);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe(VERIFY_FAILED);
  });

  it("penyerang tanpa cookie TIDAK bisa menghabiskan jatah percobaan korban", async () => {
    const { otpId, sessionSecret } = await buatPermintaan();

    // Dua puluh kali menyerang dengan token bocor, tanpa cookie.
    for (let i = 0; i < 20; i++) {
      await verifyPendingOtp(otpId, "000000", `10.9.1.${i % 5}`);
    }

    const row = await db.otpVerifikasi.findUnique({ where: { token: otpId } });
    // Inti item ini: cap korban tidak tergerus, dan barisnya tidak di-EXPIRED.
    expect(row!.attempts).toBe(0);
    expect(row!.status).toBe("PENDING");

    // Pemilik sahnya masih bisa memakai permintaannya.
    flushRedis();
    const pemilik = await verifyPendingOtp(otpId, "000000", "10.9.1.99", sessionSecret);
    expect(pemilik.ok).toBe(false); // kodenya memang salah
    const sesudah = await db.otpVerifikasi.findUnique({ where: { token: otpId } });
    expect(sesudah!.attempts).toBe(1); // baru sekarang jatahnya terpakai
  });

  it("penyerang tanpa cookie tidak bisa memicu pengiriman email (email bombing)", async () => {
    const { otpId, sessionSecret } = await buatPermintaan();
    const sebelum = await db.otpVerifikasi.findUnique({ where: { token: otpId } });

    for (let i = 0; i < 3; i++) {
      const r = await resendPendingOtp(otpId, `10.9.2.${i}`);
      expect(r.ok).toBe(false);
    }

    const sesudah = await db.otpVerifikasi.findUnique({ where: { token: otpId } });
    expect(sesudah!.resendCount).toBe(0);
    // Kode korban tidak diganti — kode yang sudah terlanjur ia terima tetap sah.
    expect(sesudah!.kodeHash).toBe(sebelum!.kodeHash);

    // Pemiliknya sendiri tetap bisa kirim ulang.
    flushRedis();
    await db.otpVerifikasi.update({
      where: { token: otpId },
      data: { lastSentAt: new Date(Date.now() - 120_000) },
    });
    expect((await resendPendingOtp(otpId, "10.9.2.99", sessionSecret)).ok).toBe(true);
  });

  it("secret disimpan sebagai hash, bukan nilai aslinya", async () => {
    const { otpId, sessionSecret } = await buatPermintaan();
    const row = await db.otpVerifikasi.findUnique({ where: { token: otpId } });

    expect(row!.sessionHash).toBeTruthy();
    expect(row!.sessionHash).not.toBe(sessionSecret);
    expect(row!.sessionHash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });
});
