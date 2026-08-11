/**
 * Blok J — pencocokan No. HP dengan kontak terdaftar (butir 3.4 laporan review).
 *
 * Yang dibuktikan di sini dan tidak bisa dibuktikan unit test: tabel
 * `pelanggan_kontak` benar-benar dibaca oleh KEDUA jalur pengajuan (OTP dan
 * non-OTP), dan penolakannya terjadi SEBELUM email kode dikirim.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

import { db } from "@/lib/db";
import { setConfig } from "@/lib/tanki/config";
import { createPendingRequest } from "@/lib/tanki/otp";
import { createTiket } from "@/lib/tanki/tiket";

const flushRedis = () =>
  execFileSync("docker", ["exec", "tanki-redis", "redis-cli", "FLUSHALL"]).toString().trim();

const HP_TERDAFTAR = "081234500001";
const HP_LAIN = "089999900002";

let pool: string[] = [];
let idx = 0;
const berikutnya = () => pool[idx++];

const dibuat: string[] = [];
const kontakDibuat: string[] = [];

async function daftarkanKontak(nosamb: string, noHp: string) {
  await db.pelangganKontak.create({ data: { nosamb, noHp, sumber: "uji-blok-j" } });
  kontakDibuat.push(nosamb);
}

async function ajukan(nosamb: string, noHp: string) {
  const r = await createTiket({
    noPelanggan: nosamb,
    noHp,
    email: `uji-j-${nosamb}@example.com`,
    keluhan: "uji integrasi blok J",
  });
  if (r.ok) dibuat.push(r.noTiket);
  return r;
}

beforeAll(async () => {
  const rows = await db.$queryRawUnsafe<{ nosamb: string }[]>(
    `SELECT p.nosamb FROM pelanggan p
       LEFT JOIN tiket t ON t.no_pelanggan = p.nosamb
      WHERE t.id IS NULL
      LIMIT 60`,
  );
  pool = rows.map((r) => r.nosamb);
  expect(pool.length).toBeGreaterThan(10);
  await setConfig({ verifikasi_hp_wajib: "false", submit_cooldown_hours: "24" });
});

beforeEach(() => flushRedis());

afterEach(async () => {
  if (kontakDibuat.length) {
    await db.pelangganKontak.deleteMany({ where: { nosamb: { in: kontakDibuat } } });
    kontakDibuat.length = 0;
  }
  await setConfig({ verifikasi_hp_wajib: "false" });
});

afterAll(async () => {
  if (dibuat.length) await db.tiket.deleteMany({ where: { noTiket: { in: dibuat } } });
  await setConfig({ verifikasi_hp_wajib: "false" });
});

describe("J1 · mode bertahap — hanya yang datanya sudah ada yang dicocokkan", () => {
  it("pelanggan TANPA kontak terdaftar tetap bisa mengajukan", async () => {
    // Ini yang membuat fitur bisa hidup hari ini: master pelanggan PDAM tidak
    // punya kolom nomor HP sama sekali, jadi mayoritas baris belum berkontak.
    const r = await ajukan(berikutnya(), HP_LAIN);
    expect(r.ok, !r.ok ? r.error : "").toBe(true);
  });

  it("pelanggan DENGAN kontak terdaftar wajib memakai nomor itu", async () => {
    const nosamb = berikutnya();
    await daftarkanKontak(nosamb, HP_TERDAFTAR);

    const salah = await ajukan(nosamb, HP_LAIN);
    expect(salah.ok).toBe(false);
    expect(!salah.ok && salah.error).toMatch(/tidak cocok dengan data pelanggan/i);

    const benar = await ajukan(nosamb, HP_TERDAFTAR);
    expect(benar.ok, !benar.ok ? benar.error : "").toBe(true);
  });

  it("beda bentuk penulisan nomor tetap diterima", async () => {
    // Data kontak PDAM hampir pasti bercampur "+62", "62", dan "0".
    const nosamb = berikutnya();
    await daftarkanKontak(nosamb, "+62 812-3450-0001");

    const r = await ajukan(nosamb, HP_TERDAFTAR);
    expect(r.ok, !r.ok ? r.error : "").toBe(true);
  });
});

describe("J2 · mode ketat", () => {
  it("tanpa kontak terdaftar, pengajuan ditolak", async () => {
    await setConfig({ verifikasi_hp_wajib: "true" });
    const r = await ajukan(berikutnya(), HP_LAIN);
    expect(r.ok).toBe(false);
  });

  it("pesannya sama persis dengan 'nomor tidak cocok'", async () => {
    // Kalau berbeda, halaman ini jadi alat memetakan No. Pelanggan mana yang
    // sudah punya kontak di database PDAM.
    await setConfig({ verifikasi_hp_wajib: "true" });

    const tanpaKontak = await ajukan(berikutnya(), HP_LAIN);

    const nosamb = berikutnya();
    await daftarkanKontak(nosamb, HP_TERDAFTAR);
    const salahNomor = await ajukan(nosamb, HP_LAIN);

    expect(tanpaKontak.ok).toBe(false);
    expect(salahNomor.ok).toBe(false);
    expect(!tanpaKontak.ok && tanpaKontak.error).toBe(!salahNomor.ok && salahNomor.error);
  });
});

describe("J3 · jalur OTP ditolak SEBELUM email dikirim", () => {
  it("nomor yang tidak cocok tidak menghasilkan baris OTP sama sekali", async () => {
    // Tanpa pemeriksaan di createPendingRequest, form ini bisa dipakai
    // mengirimi orang lain email kode yang tidak mereka minta.
    const nosamb = berikutnya();
    await daftarkanKontak(nosamb, HP_TERDAFTAR);

    const sebelum = await db.otpVerifikasi.count({ where: { noPelanggan: nosamb } });

    const r = await createPendingRequest({
      noPelanggan: nosamb,
      noHp: HP_LAIN,
      email: `uji-j-otp-${nosamb}@example.com`,
      keluhan: "uji integrasi blok J",
    });

    expect(r.ok).toBe(false);
    const sesudah = await db.otpVerifikasi.count({ where: { noPelanggan: nosamb } });
    expect(sesudah).toBe(sebelum);
  });

  it("nomor yang cocok tetap melanjutkan alur OTP seperti biasa", async () => {
    const nosamb = berikutnya();
    await daftarkanKontak(nosamb, HP_TERDAFTAR);

    const r = await createPendingRequest({
      noPelanggan: nosamb,
      noHp: HP_TERDAFTAR,
      email: `uji-j-otp2-${nosamb}@example.com`,
      keluhan: "uji integrasi blok J",
    });
    expect(r.ok, !r.ok ? r.error : "").toBe(true);
  });
});
