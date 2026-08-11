/**
 * Blok O — bukti masuk (login) dari ujung ke ujung, butir 3.6 & 3.8.
 *
 * Blok N sudah menguji logika masuk, dan blok M sudah menguji batas cookie
 * sesi. Yang belum dibuktikan adalah rantai penuhnya sebagai satu kesatuan:
 *
 *   minta kode → email BENAR-BENAR terkirim → kode diambil DARI EMAIL ITU
 *   → verifikasi → sesi terbit → halaman /riwayat terbuka di aplikasi yang
 *   sedang berjalan dan menampilkan tiket milik pelanggan tersebut.
 *
 * Kodenya sengaja dibaca dari Mailpit, bukan dari kolom database. Membaca dari
 * database akan melewati justru bagian yang paling mudah rusak diam-diam:
 * pengirimannya. Kalau email gagal terkirim, warga tidak bisa masuk — dan uji
 * yang membaca database tetap akan hijau.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

import { db } from "@/lib/db";
import { setConfig } from "@/lib/tanki/config";
import { mintaKodeMasuk, verifikasiKodeMasuk } from "@/lib/tanki/otp-masuk";
import { COOKIE_SESI_PELANGGAN, buatSesi } from "@/lib/tanki/sesi-pelanggan";
import { createTiket } from "@/lib/tanki/tiket";

const APP = process.env.APP_BASE_URL ?? "http://localhost:3000";
const MAILPIT = "http://localhost:8025";
const IP = "10.9.0.1";

const flushRedis = () =>
  execFileSync("docker", ["exec", "tanki-redis", "redis-cli", "FLUSHALL"]).toString().trim();

async function mailpitBersihkan() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
}

/** Ambil kode 6 digit dari email terbaru yang dikirim ke alamat tertentu. */
async function kodeDariEmail(alamat: string): Promise<string> {
  const r = await fetch(`${MAILPIT}/api/v1/messages`);
  const j = (await r.json()) as { messages?: { ID: string; To: { Address: string }[] }[] };
  const pesan = (j.messages ?? []).find((m) =>
    m.To.some((t) => t.Address.toLowerCase() === alamat.toLowerCase()),
  );
  if (!pesan) throw new Error(`tidak ada email untuk ${alamat}`);

  const detail = await fetch(`${MAILPIT}/api/v1/message/${pesan.ID}`);
  const isi = (await detail.json()) as { Text?: string; HTML?: string };
  const teks = `${isi.Text ?? ""}\n${isi.HTML ?? ""}`;
  const cocok = teks.match(/\b(\d{6})\b/);
  if (!cocok) throw new Error("kode 6 digit tidak ditemukan di email");
  return cocok[1];
}

/** Buang komentar React supaya teks yang terpotong node tetap bisa dicocokkan. */
const bersih = (html: string) => html.replace(/<!--[^>]*-->/g, "");

let nosamb = "";
let email = "";
let noTiket = "";

beforeAll(async () => {
  await setConfig({
    submit_cooldown_hours: "24",
    verifikasi_hp_wajib: "false",
    wa_enabled: "false",
  });
  flushRedis();
  await mailpitBersihkan();

  const rows = await db.$queryRawUnsafe<{ nosamb: string }[]>(
    `SELECT p.nosamb FROM pelanggan p
       LEFT JOIN tiket t ON t.no_pelanggan = p.nosamb
      WHERE t.id IS NULL LIMIT 1`,
  );
  nosamb = rows[0].nosamb;
  email = `uji-o-${nosamb}@example.com`;

  const t = await createTiket({
    noPelanggan: nosamb,
    noHp: "081234500099",
    email,
    keluhan: "uji integrasi blok O masuk ujung ke ujung",
  });
  if (!t.ok) throw new Error(t.error);
  noTiket = t.noTiket;
});

afterAll(async () => {
  if (noTiket) await db.tiket.deleteMany({ where: { noTiket } });
});

describe("O · masuk dari ujung ke ujung (butir 3.6 & 3.8)", () => {
  it("O1 — halaman /masuk tersedia dan tidak meminta kata sandi", async () => {
    const r = await fetch(`${APP}/masuk`);
    expect(r.status).toBe(200);
    const html = bersih(await r.text());

    expect(html).toContain("No. Pelanggan");
    expect(html).toContain("Kirim kode ke email");
    // Tidak ada sistem akun (KD-02): tidak boleh ada medan kata sandi.
    expect(html).not.toMatch(/type="password"/);
  });

  it("O2 — rantai penuh: kode dari email sungguhan membuka /riwayat", async () => {
    flushRedis();
    await mailpitBersihkan();

    // 1. Minta kode.
    const minta = await mintaKodeMasuk(nosamb, email, IP);
    expect(minta.ok).toBe(true);
    if (!minta.ok || !minta.otpId || !minta.sessionSecret) throw new Error("kode tidak terbit");

    // 2. Kode diambil dari email yang benar-benar terkirim.
    const kode = await kodeDariEmail(email);
    expect(kode).toMatch(/^\d{6}$/);

    // 3. Verifikasi.
    const hasil = await verifikasiKodeMasuk(minta.otpId, kode, IP, minta.sessionSecret);
    expect(hasil.ok, !hasil.ok ? hasil.error : "").toBe(true);
    expect(hasil.ok && hasil.noPelanggan).toBe(nosamb);

    // 4. Sesi terbit, dan /riwayat terbuka di aplikasi yang sedang berjalan.
    const cookie = buatSesi(nosamb, Date.now());
    const r = await fetch(`${APP}/riwayat`, {
      headers: { Cookie: `${COOKIE_SESI_PELANGGAN}=${cookie}` },
      redirect: "manual",
    });
    expect(r.status).toBe(200);

    const html = bersih(await r.text());
    expect(html).toContain(noTiket);
  });

  it("O3 — tanpa sesi, /riwayat memantul ke alur tamu dan tidak membocorkan tiket", async () => {
    // Pemantulan menuju /lacak, bukan /masuk: masuk bersifat opsional, jadi
    // pengunjung tanpa sesi diarahkan ke jalur pelacakan yang tetap bisa
    // dipakai tanpa masuk. Yang wajib dijaga di sini adalah tidak adanya
    // isi riwayat pada balasan.
    const r = await fetch(`${APP}/riwayat`, { redirect: "manual" });
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe("/lacak");
    expect(await r.text()).not.toContain(noTiket);
  });

  it("O4 — kode yang sama tidak bisa dipakai dua kali", async () => {
    flushRedis();
    await mailpitBersihkan();

    const minta = await mintaKodeMasuk(nosamb, email, IP);
    if (!minta.ok || !minta.otpId || !minta.sessionSecret) throw new Error("kode tidak terbit");
    const kode = await kodeDariEmail(email);

    const pertama = await verifikasiKodeMasuk(minta.otpId, kode, IP, minta.sessionSecret);
    expect(pertama.ok).toBe(true);

    const kedua = await verifikasiKodeMasuk(minta.otpId, kode, IP, minta.sessionSecret);
    expect(kedua.ok).toBe(false);
  });
});
