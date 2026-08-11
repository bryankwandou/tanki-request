/**
 * Blok M — sesi pelanggan opsional (butir 3.6 & 3.8 laporan review).
 *
 * Diadu ke aplikasi yang benar-benar berjalan. Yang paling penting dibuktikan
 * di sini bukan fitur kenyamanannya, tapi batasnya: cookie sesi TIDAK bisa
 * dipalsukan untuk membaca riwayat pelanggan lain.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

import { db } from "@/lib/db";
import { setConfig } from "@/lib/tanki/config";
import { COOKIE_SESI_PELANGGAN, buatSesi } from "@/lib/tanki/sesi-pelanggan";
import { createTiket } from "@/lib/tanki/tiket";

const APP = process.env.APP_BASE_URL ?? "http://localhost:3000";

const flushRedis = () =>
  execFileSync("docker", ["exec", "tanki-redis", "redis-cli", "FLUSHALL"]).toString().trim();

let nosambA = "";
let nosambB = "";
const dibuat: string[] = [];
const KELUHAN_A = "uji integrasi blok M — pelanggan A";
const KELUHAN_B = "uji integrasi blok M — pelanggan B";

async function ajukan(nosamb: string, keluhan: string) {
  const r = await createTiket({
    noPelanggan: nosamb,
    noHp: "081234567822",
    email: `uji-m-${nosamb}@example.com`,
    keluhan,
  });
  if (!r.ok) throw new Error(r.error);
  dibuat.push(r.noTiket);
  return r.noTiket;
}

/** Buka halaman dengan cookie sesi tertentu (atau tanpa cookie). */
async function bukaRiwayat(cookie?: string) {
  const r = await fetch(`${APP}/riwayat`, {
    headers: cookie ? { Cookie: `${COOKIE_SESI_PELANGGAN}=${cookie}` } : {},
    redirect: "manual",
  });
  return { status: r.status, lokasi: r.headers.get("location"), html: await r.text() };
}

beforeAll(async () => {
  await setConfig({ submit_cooldown_hours: "24", verifikasi_hp_wajib: "false", wa_enabled: "false" });

  const rows = await db.$queryRawUnsafe<{ nosamb: string }[]>(
    `SELECT p.nosamb FROM pelanggan p
       LEFT JOIN tiket t ON t.no_pelanggan = p.nosamb
      WHERE t.id IS NULL LIMIT 2`,
  );
  nosambA = rows[0].nosamb;
  nosambB = rows[1].nosamb;

  await ajukan(nosambA, KELUHAN_A);
  await ajukan(nosambB, KELUHAN_B);
});

afterAll(async () => {
  if (dibuat.length) await db.tiket.deleteMany({ where: { noTiket: { in: dibuat } } });
});

beforeEach(() => flushRedis());

describe("M1 · riwayat hanya untuk pemilik sesi (butir 3.8)", () => {
  it("sesi yang sah menampilkan tiket pelanggan itu, tanpa mengetik apa pun", async () => {
    const { status, html } = await bukaRiwayat(buatSesi(nosambA, Date.now()));
    expect(status).toBe(200);
    expect(html).toContain(nosambA);
    expect(html).toContain(KELUHAN_A);
  });

  it("riwayat pelanggan LAIN tidak ikut tampil", async () => {
    const { html } = await bukaRiwayat(buatSesi(nosambA, Date.now()));
    expect(html).not.toContain(KELUHAN_B);
    expect(html).not.toContain(nosambB);
  });

  it("tanpa sesi, halaman riwayat tidak menampilkan apa pun", async () => {
    // Tidak ada kolom "ketik No. Pelanggan" di halaman ini — kalau ada, ia jadi
    // jalan pintas membaca riwayat orang lain tanpa bukti kepemilikan.
    const { status, lokasi, html } = await bukaRiwayat();
    expect([302, 307]).toContain(status);
    expect(lokasi).toContain("/lacak");
    expect(html).not.toContain(KELUHAN_A);
  });
});

describe("M2 · cookie sesi tidak bisa dipalsukan", () => {
  it("payload yang diganti ke No. Pelanggan lain ditolak", async () => {
    // Serangan yang paling jelas: ambil cookie sendiri, tukar nomornya.
    const sah = buatSesi(nosambA, Date.now());
    const [, sig] = sah.split(".");
    const palsu =
      Buffer.from(JSON.stringify({ nop: nosambB, exp: Date.now() + 86_400_000 })).toString(
        "base64url",
      ) + `.${sig}`;

    const { status, html } = await bukaRiwayat(palsu);
    expect([302, 307]).toContain(status);
    expect(html).not.toContain(KELUHAN_B);
  });

  it("cookie yang ditulis sendiri tanpa tanda tangan ditolak", async () => {
    const payload = Buffer.from(
      JSON.stringify({ nop: nosambB, exp: Date.now() + 86_400_000 }),
    ).toString("base64url");

    const { status, html } = await bukaRiwayat(payload);
    expect([302, 307]).toContain(status);
    expect(html).not.toContain(KELUHAN_B);
  });

  it("sesi yang sudah kedaluwarsa ditolak", async () => {
    // exp ikut ditandatangani, jadi ini tanda tangan yang SAH tapi sudah lewat.
    const lampau = buatSesi(nosambA, Date.now() - 40 * 24 * 60 * 60_000);
    const { status } = await bukaRiwayat(lampau);
    expect([302, 307]).toContain(status);
  });

  it("sampah acak tidak membuat halaman error 500", async () => {
    for (const s of ["abc", "a.b", "...", "x".repeat(300)]) {
      const { status } = await bukaRiwayat(s);
      expect([302, 307], `cookie: ${s}`).toContain(status);
    }
  });
});

describe("M3 · auto-fill di form pengajuan (butir 3.6)", () => {
  it("beranda mengisi No. Pelanggan otomatis untuk pengguna yang sudah terverifikasi", async () => {
    const r = await fetch(APP, {
      headers: { Cookie: `${COOKIE_SESI_PELANGGAN}=${buatSesi(nosambA, Date.now())}` },
    });
    const html = await r.text();
    expect(html).toContain(`value="${nosambA}"`);
    expect(html).toContain("sudah terisi otomatis");
  });

  it("tanpa sesi, form tetap kosong dan alur tamu tidak berubah", async () => {
    // Login bersifat OPSIONAL — alur tanpa akun harus tetap utuh.
    const html = await (await fetch(APP)).text();
    expect(html).not.toContain("sudah terisi otomatis");
    expect(html).toContain("Ajukan Permintaan");
  });
});
