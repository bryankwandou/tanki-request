/**
 * Blok N — kontak dari riwayat & masuk tanpa mengajukan.
 *
 *   N1  kontak terkumpul dari permintaan yang DIVERIFIKASI PETUGAS (butir 3.4)
 *   N2  masuk dengan kode email, tanpa mengajukan lebih dulu (butir 3.6)
 *   N3  kode MASUK dan kode TIKET tidak bisa saling dipakai
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

import { db } from "@/lib/db";
import { setConfig } from "@/lib/tanki/config";
import { catatKontakDariTiket } from "@/lib/tanki/kontak";
import { createPendingRequest, verifyPendingOtp } from "@/lib/tanki/otp";
import { mintaKodeMasuk, verifikasiKodeMasuk } from "@/lib/tanki/otp-masuk";
import { createTiket } from "@/lib/tanki/tiket";

const flushRedis = () =>
  execFileSync("docker", ["exec", "tanki-redis", "redis-cli", "FLUSHALL"]).toString().trim();

const HP_ASLI = "081234500077";
const HP_LAIN = "089999900088";

let pool: string[] = [];
let idx = 0;
const berikutnya = () => pool[idx++];
const tiketDibuat: string[] = [];
const kontakDibuat: string[] = [];

async function ajukan(nosamb: string, noHp: string, email?: string) {
  const r = await createTiket({
    noPelanggan: nosamb,
    noHp,
    email: email ?? `uji-n-${nosamb}@example.com`,
    keluhan: "uji integrasi blok N",
  });
  if (r.ok) tiketDibuat.push(r.noTiket);
  return r;
}

beforeAll(async () => {
  await setConfig({
    submit_cooldown_hours: "24",
    verifikasi_hp_wajib: "false",
    wa_enabled: "false",
  });
  const rows = await db.$queryRawUnsafe<{ nosamb: string }[]>(
    `SELECT p.nosamb FROM pelanggan p
       LEFT JOIN tiket t ON t.no_pelanggan = p.nosamb
      WHERE t.id IS NULL LIMIT 60`,
  );
  pool = rows.map((r) => r.nosamb);
  expect(pool.length).toBeGreaterThan(10);
});

beforeEach(() => flushRedis());

afterEach(async () => {
  if (kontakDibuat.length) {
    await db.pelangganKontak.deleteMany({ where: { nosamb: { in: kontakDibuat } } });
    kontakDibuat.length = 0;
  }
});

afterAll(async () => {
  if (tiketDibuat.length)
    await db.tiket.deleteMany({ where: { noTiket: { in: tiketDibuat } } });
});

describe("N1 · kontak terkumpul dari riwayat yang diverifikasi petugas (butir 3.4)", () => {
  it("verifikasi petugas mencatat nomor pelapor sebagai kontak terdaftar", async () => {
    const nosamb = berikutnya();
    kontakDibuat.push(nosamb);
    expect((await ajukan(nosamb, HP_ASLI)).ok).toBe(true);

    const hasil = await catatKontakDariTiket(nosamb, HP_ASLI);
    expect(hasil.dicatat).toBe(true);

    const kontak = await db.pelangganKontak.findUnique({ where: { nosamb } });
    expect(kontak?.noHp).toBe(HP_ASLI);
    expect(kontak?.sumber).toBe("verifikasi-petugas");
  });

  it("kontak yang SUDAH ada tidak ditimpa oleh alur publik", async () => {
    // Kalau ini bisa ditimpa, pencocokan nomor kehilangan artinya: penyerang
    // tinggal mengajukan sekali untuk mengganti nomor terdaftar korban.
    const nosamb = berikutnya();
    kontakDibuat.push(nosamb);
    await db.pelangganKontak.create({
      data: { nosamb, noHp: HP_ASLI, sumber: "impor-loket" },
    });

    const hasil = await catatKontakDariTiket(nosamb, HP_LAIN);
    expect(hasil.dicatat).toBe(false);

    const kontak = await db.pelangganKontak.findUnique({ where: { nosamb } });
    expect(kontak?.noHp).toBe(HP_ASLI);
    expect(kontak?.sumber).toBe("impor-loket");
  });

  it("setelah tercatat, nomor lain langsung tertolak pada pengajuan berikutnya", async () => {
    // Inilah rantai lengkapnya: riwayat → kontak → perlindungan.
    const nosamb = berikutnya();
    kontakDibuat.push(nosamb);
    expect((await ajukan(nosamb, HP_ASLI)).ok).toBe(true);
    await catatKontakDariTiket(nosamb, HP_ASLI);

    await db.tiket.updateMany({ where: { noPelanggan: nosamb }, data: { status: "SELESAI" } });
    await db.$executeRawUnsafe(
      `UPDATE tiket SET created_at = DATE_SUB(NOW(), INTERVAL 48 HOUR) WHERE no_pelanggan = ?`,
      nosamb,
    );

    const orangLain = await ajukan(nosamb, HP_LAIN);
    expect(orangLain.ok).toBe(false);
    expect(!orangLain.ok && orangLain.error).toMatch(/tidak cocok dengan data pelanggan/i);

    const pemilik = await ajukan(nosamb, HP_ASLI);
    expect(pemilik.ok, !pemilik.ok ? pemilik.error : "").toBe(true);
  });
});

describe("N2 · masuk tanpa mengajukan lebih dulu (butir 3.6)", () => {
  it("kombinasi No. Pelanggan + email yang pernah dipakai menerbitkan kode", async () => {
    const nosamb = berikutnya();
    const email = `uji-n-masuk-${nosamb}@example.com`;
    expect((await ajukan(nosamb, HP_ASLI, email)).ok).toBe(true);

    const r = await mintaKodeMasuk(nosamb, email, "10.5.0.1");
    expect(r.ok).toBe(true);
    expect(r.ok && r.otpId).toBeTruthy();
    expect(r.ok && r.emailMasked).not.toContain(email.split("@")[0]);
  });

  it("email yang TIDAK pernah dipakai: balasan sama, tapi tidak ada kode terbit", async () => {
    // Balasan yang berbeda akan memberi tahu penyerang apakah sebuah
    // No. Pelanggan pernah memakai layanan, dan email siapa yang terpaut.
    const nosamb = berikutnya();
    expect((await ajukan(nosamb, HP_ASLI)).ok).toBe(true);

    const sebelum = await db.otpVerifikasi.count({ where: { noPelanggan: nosamb, tujuan: "MASUK" } });
    const r = await mintaKodeMasuk(nosamb, "penyerang@example.com", "10.5.0.2");

    expect(r.ok).toBe(true);
    expect(r.ok && r.otpId).toBeNull();
    const sesudah = await db.otpVerifikasi.count({ where: { noPelanggan: nosamb, tujuan: "MASUK" } });
    expect(sesudah).toBe(sebelum);
  });

  it("kode yang benar menerbitkan akses ke No. Pelanggan itu, bukan yang lain", async () => {
    const nosamb = berikutnya();
    const email = `uji-n-masuk2-${nosamb}@example.com`;
    expect((await ajukan(nosamb, HP_ASLI, email)).ok).toBe(true);

    const minta = await mintaKodeMasuk(nosamb, email, "10.5.0.3");
    if (!minta.ok || !minta.otpId || !minta.sessionSecret) throw new Error("kode tidak terbit");

    // Ambil kode dari database (di produksi ia hanya ada di email).
    const baris = await db.otpVerifikasi.findUniqueOrThrow({ where: { token: minta.otpId } });
    const kode = await tebakKode(baris.kodeHash);

    const hasil = await verifikasiKodeMasuk(minta.otpId, kode, "10.5.0.3", minta.sessionSecret);
    expect(hasil.ok, !hasil.ok ? hasil.error : "").toBe(true);
    expect(hasil.ok && hasil.noPelanggan).toBe(nosamb);
  });

  it("tanpa cookie sesi, kode yang bocor tidak bisa dipakai", async () => {
    const nosamb = berikutnya();
    const email = `uji-n-masuk3-${nosamb}@example.com`;
    expect((await ajukan(nosamb, HP_ASLI, email)).ok).toBe(true);

    const minta = await mintaKodeMasuk(nosamb, email, "10.5.0.4");
    if (!minta.ok || !minta.otpId) throw new Error("kode tidak terbit");
    const baris = await db.otpVerifikasi.findUniqueOrThrow({ where: { token: minta.otpId } });
    const kode = await tebakKode(baris.kodeHash);

    const hasil = await verifikasiKodeMasuk(minta.otpId, kode, "10.5.0.4", "cookie-palsu");
    expect(hasil.ok).toBe(false);
  });
});

describe("N3 · kode MASUK dan kode TIKET tidak bisa saling dipakai", () => {
  it("kode MASUK tidak bisa menyelesaikan pembuatan tiket", async () => {
    const nosamb = berikutnya();
    const email = `uji-n-silang-${nosamb}@example.com`;
    expect((await ajukan(nosamb, HP_ASLI, email)).ok).toBe(true);

    const minta = await mintaKodeMasuk(nosamb, email, "10.6.0.1");
    if (!minta.ok || !minta.otpId || !minta.sessionSecret) throw new Error("kode tidak terbit");
    const baris = await db.otpVerifikasi.findUniqueOrThrow({ where: { token: minta.otpId } });
    const kode = await tebakKode(baris.kodeHash);

    const sebelum = await db.tiket.count({ where: { noPelanggan: nosamb } });
    const hasil = await verifyPendingOtp(minta.otpId, kode, "10.6.0.1", minta.sessionSecret);

    expect(hasil.ok).toBe(false);
    expect(await db.tiket.count({ where: { noPelanggan: nosamb } })).toBe(sebelum);
  });

  it("kode TIKET tidak bisa menerbitkan sesi masuk", async () => {
    const nosamb = berikutnya();
    const pending = await createPendingRequest({
      noPelanggan: nosamb,
      noHp: HP_ASLI,
      email: `uji-n-silang2-${nosamb}@example.com`,
      keluhan: "uji integrasi blok N",
    });
    if (!pending.ok) throw new Error(pending.error);

    const baris = await db.otpVerifikasi.findUniqueOrThrow({ where: { token: pending.otpId } });
    const kode = await tebakKode(baris.kodeHash);

    const hasil = await verifikasiKodeMasuk(
      pending.otpId,
      kode,
      "10.6.0.2",
      pending.sessionSecret,
    );
    expect(hasil.ok).toBe(false);
  });
});

/**
 * Cari kode 6 digit yang cocok dengan hash-nya.
 *
 * Uji ini perlu tahu kodenya, dan kode hanya tersimpan sebagai SHA-256 — itu
 * memang yang diinginkan. Menyapu 10^6 kemungkinan di sini bukan bukti bahwa
 * hash-nya lemah; ia hanya menegaskan bahwa panjang 6 digit bertumpu pada
 * pembatasan percobaan, bukan pada kekuatan hash.
 */
async function tebakKode(kodeHash: string): Promise<string> {
  const crypto = await import("node:crypto");
  for (let i = 0; i < 1_000_000; i++) {
    const kandidat = String(i).padStart(6, "0");
    if (crypto.createHash("sha256").update(kandidat).digest("hex") === kodeHash) return kandidat;
  }
  throw new Error("kode tidak ditemukan");
}
