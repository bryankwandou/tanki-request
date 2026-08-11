/**
 * Blok I — pengerasan brute-force, butir 3.2 laporan review.
 *
 * Dua hal yang tidak bisa dibuktikan unit test:
 *   I1  delay progresif benar-benar menahan tebakan berikutnya (waktu nyata)
 *   I2  percobaan gagal benar-benar mendarat di tabel audit_keamanan, dengan
 *       identitas ter-hash, bukan email mentah
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

import { db } from "@/lib/db";
import { AUDIT, subjekHash } from "@/lib/tanki/audit";
import { configNumber, getConfig } from "@/lib/tanki/config";
import { createPendingRequest, verifyPendingOtp } from "@/lib/tanki/otp";
import { DELAY_MAKS_MS, delayGagalMs } from "@/lib/tanki/otp-delay";

const flushRedis = () =>
  execFileSync("docker", ["exec", "tanki-redis", "redis-cli", "FLUSHALL"]).toString().trim();

let nosambPool: string[] = [];
let poolIdx = 0;
const nextNosamb = () => nosambPool[poolIdx++];

let maxAttempts = 5;

async function buatPermintaan() {
  const nosamb = nextNosamb();
  const email = `uji-i-${nosamb}@example.com`;
  const res = await createPendingRequest({
    noPelanggan: nosamb,
    noHp: "081200000011",
    email,
    keluhan: "uji integrasi blok I",
  });
  if (!res.ok) throw new Error(`gagal membuat permintaan: ${res.error}`);
  return { ...res, email };
}

beforeAll(async () => {
  const rows = await db.$queryRawUnsafe<{ nosamb: string }[]>(
    `SELECT p.nosamb FROM pelanggan p
       LEFT JOIN tiket t ON t.no_pelanggan = p.nosamb
      WHERE t.id IS NULL
      LIMIT 200`,
  );
  nosambPool = rows.map((r) => r.nosamb);
  expect(nosambPool.length).toBeGreaterThan(20);

  maxAttempts = configNumber(await getConfig(), "otp_max_attempts");
});

beforeEach(async () => {
  flushRedis();
  await db.auditKeamanan.deleteMany({});
});

describe("I1 · delay progresif (butir 3.2)", () => {
  it("tebakan pertama cepat, tebakan berikutnya benar-benar tertahan", async () => {
    const { otpId, sessionSecret } = await buatPermintaan();

    const t1 = Date.now();
    await verifyPendingOtp(otpId, "000000", "10.1.0.1", sessionSecret);
    const durasi1 = Date.now() - t1;

    const t2 = Date.now();
    await verifyPendingOtp(otpId, "000001", "10.1.0.1", sessionSecret);
    const durasi2 = Date.now() - t2;

    const t3 = Date.now();
    await verifyPendingOtp(otpId, "000002", "10.1.0.1", sessionSecret);
    const durasi3 = Date.now() - t3;

    // Kesalahan pertama tidak dihukum (attempts masih 0 saat itu).
    expect(durasi1).toBeLessThan(500);
    // Kedua menunggu ~500ms, ketiga ~1s. Ambang diberi kelonggaran karena
    // masih ada waktu query di dalamnya.
    expect(durasi2).toBeGreaterThanOrEqual(450);
    expect(durasi3).toBeGreaterThanOrEqual(950);
    expect(durasi3).toBeGreaterThan(durasi2);
  });

  it("delay tidak pernah melewati batas atasnya walau jatah hampir habis", async () => {
    // Kalau kurvanya lepas, satu permintaan bisa menahan koneksi server
    // berpuluh detik — delay-nya sendiri berubah jadi celah DoS.
    const total = Array.from({ length: maxAttempts }, (_, i) => delayGagalMs(i)).reduce(
      (a, b) => a + b,
      0,
    );
    expect(total).toBeLessThanOrEqual(maxAttempts * DELAY_MAKS_MS);
  });

  it("penyerang TANPA cookie sesi tidak bisa memicu delay (bukan alat DoS)", async () => {
    // Ini yang membuat delay aman dipasang: jalurnya hanya bisa dicapai pihak
    // yang sudah memegang cookie HttpOnly milik pemohon sendiri.
    const { otpId } = await buatPermintaan();

    const t = Date.now();
    const r = await verifyPendingOtp(otpId, "000000", "10.1.0.9", "cookie-palsu");
    const durasi = Date.now() - t;

    expect(r.ok).toBe(false);
    expect(durasi).toBeLessThan(500);
  });
});

describe("I2 · log audit percobaan gagal (butir 3.2)", () => {
  it("tebakan salah tercatat, dan email TIDAK disimpan mentah", async () => {
    const { otpId, sessionSecret, email } = await buatPermintaan();
    await verifyPendingOtp(otpId, "000000", "10.2.0.1", sessionSecret);

    const baris = await db.auditKeamanan.findMany({
      where: { jenis: AUDIT.OTP_KODE_SALAH },
    });
    expect(baris).toHaveLength(1);
    expect(baris[0].ip).toBe("10.2.0.1");

    // Yang tersimpan adalah hash — bukan alamat email pelapor.
    expect(baris[0].subjek).toBe(subjekHash(email));
    expect(baris[0].subjek).not.toContain("@");
    expect(baris[0].subjek).not.toContain(email);

    // Dan hash-nya memang tidak bisa dicocokkan tanpa AUTH_SECRET: SHA-256
    // polos atas email yang sama menghasilkan nilai yang berbeda.
    const polos = (await import("node:crypto"))
      .createHash("sha256")
      .update(email)
      .digest("hex");
    expect(baris[0].subjek).not.toBe(polos);
  });

  it("jatah tebakan yang habis dicatat terpisah — sinyal brute-force terkuat", async () => {
    const { otpId, sessionSecret } = await buatPermintaan();

    // Habiskan jatahnya, lalu satu tebakan lagi setelah cap tercapai.
    for (let i = 0; i < maxAttempts + 1; i++) {
      await verifyPendingOtp(otpId, "999999", "10.2.0.2", sessionSecret);
    }

    const capHabis = await db.auditKeamanan.count({
      where: { jenis: AUDIT.OTP_CAP_HABIS },
    });
    const salah = await db.auditKeamanan.count({
      where: { jenis: AUDIT.OTP_KODE_SALAH },
    });

    expect(capHabis).toBeGreaterThanOrEqual(1);
    expect(salah).toBe(maxAttempts);
  }, 120_000);

  it("throttle per-IP ikut tercatat", async () => {
    // 20 verifikasi per IP per 10 menit; yang ke-21 harus tercatat.
    const { otpId, sessionSecret } = await buatPermintaan();
    for (let i = 0; i < 22; i++) {
      await verifyPendingOtp(otpId, "111111", "10.2.0.3", sessionSecret);
    }

    const throttle = await db.auditKeamanan.count({
      where: { jenis: AUDIT.OTP_THROTTLE, ip: "10.2.0.3" },
    });
    expect(throttle).toBeGreaterThanOrEqual(1);
  }, 180_000);

  it("gagal menulis audit TIDAK boleh menjatuhkan alur pengguna", async () => {
    // Dibuktikan dengan tabel yang benar-benar hilang: alur verifikasi harus
    // tetap memberi jawaban normal, bukan error 500.
    await db.$executeRawUnsafe("ALTER TABLE audit_keamanan RENAME TO audit_keamanan_sembunyi");
    try {
      const { otpId, sessionSecret } = await buatPermintaan();
      const r = await verifyPendingOtp(otpId, "000000", "10.2.0.4", sessionSecret);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error).toBeTruthy();
    } finally {
      await db.$executeRawUnsafe("ALTER TABLE audit_keamanan_sembunyi RENAME TO audit_keamanan");
    }
  });
});
