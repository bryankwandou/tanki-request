/**
 * Blok L — posisi armada di halaman lacak (butir 3.5 laporan review).
 *
 * Yang dibuktikan di sini: posisi yang diisi petugas benar-benar sampai ke
 * halaman publik, DAN identitas petugas (nama sopir, nomor polisi) tidak ikut
 * terbawa — halaman lacak menjawab "airnya sampai mana", bukan "siapa yang
 * membawanya".
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

import { db } from "@/lib/db";
import { setConfig } from "@/lib/tanki/config";
import { createTiket } from "@/lib/tanki/tiket";

const APP = process.env.APP_BASE_URL ?? "http://localhost:3000";

const flushRedis = () =>
  execFileSync("docker", ["exec", "tanki-redis", "redis-cli", "FLUSHALL"]).toString().trim();

const HP = "081234567811";
const NOPOL_UJI = "DD 9999 XX";
const SOPIR_UJI = "Sopir Uji Blok L";

let nosamb = "";
let noTiket = "";
let tiketId = 0n;
let penugasanId = 0n;
let kendaraanId = 0n;
let sopirId = 0n;

const buka = async (qs: string) => {
  const r = await fetch(`${APP}/lacak?${qs}`, {
    headers: { "X-Forwarded-For": "8.8.4.4, 203.0.113.55" },
  });
  return { status: r.status, html: await r.text() };
};

beforeAll(async () => {
  await setConfig({ submit_cooldown_hours: "24", verifikasi_hp_wajib: "false", wa_enabled: "false" });

  const rows = await db.$queryRawUnsafe<{ nosamb: string }[]>(
    `SELECT p.nosamb FROM pelanggan p
       LEFT JOIN tiket t ON t.no_pelanggan = p.nosamb
      WHERE t.id IS NULL LIMIT 1`,
  );
  nosamb = rows[0].nosamb;

  const r = await createTiket({
    noPelanggan: nosamb,
    noHp: HP,
    email: `uji-l-${nosamb}@example.com`,
    keluhan: "uji integrasi blok L",
  });
  if (!r.ok) throw new Error(r.error);
  noTiket = r.noTiket;

  const tiket = await db.tiket.findUniqueOrThrow({ where: { noTiket } });
  tiketId = tiket.id;

  const kendaraan = await db.kendaraan.create({
    data: { nopol: NOPOL_UJI, merk: "Uji", kapasitasLiter: 5000 },
  });
  kendaraanId = kendaraan.id;
  const sopir = await db.sopir.create({ data: { nama: SOPIR_UJI } });
  sopirId = sopir.id;

  const penugasan = await db.penugasan.create({
    data: {
      tiketId,
      kendaraanId,
      sopirId,
      jadwalMulai: new Date(),
      status: "BERANGKAT",
    },
  });
  penugasanId = penugasan.id;
});

afterAll(async () => {
  await db.penugasan.deleteMany({ where: { id: penugasanId } });
  await db.tiket.deleteMany({ where: { noTiket } });
  await db.kendaraan.deleteMany({ where: { id: kendaraanId } });
  await db.sopir.deleteMany({ where: { id: sopirId } });
});

beforeEach(() => flushRedis());

describe("L1 · posisi tampil di halaman lacak", () => {
  it("keterangan teks yang diisi petugas terlihat pelapor", async () => {
    await db.penugasan.update({
      where: { id: penugasanId },
      data: { lokasiTeks: "Jl. Perintis Kemerdekaan, dekat SPBU", lokasiPada: new Date() },
    });

    const { status, html } = await buka(`nop=${nosamb}&hp=${HP}`);
    expect(status).toBe(200);
    expect(html).toContain("Posisi armada");
    expect(html).toContain("Jl. Perintis Kemerdekaan, dekat SPBU");
  });

  it("koordinat memunculkan tautan peta ke titik yang benar", async () => {
    await db.penugasan.update({
      where: { id: penugasanId },
      data: { lokasiLat: "-5.1477", lokasiLng: "119.4327", lokasiPada: new Date() },
    });

    const { html } = await buka(`nop=${nosamb}&hp=${HP}`);
    expect(html).toContain("openstreetmap.org");
    expect(html).toContain("mlat=-5.1477");
  });

  it("selalu disertai keterangan 'diperbarui …'", async () => {
    // Tanpa itu, posisi tiga jam lalu terbaca sebagai posisi sekarang.
    const { html } = await buka(`nop=${nosamb}&hp=${HP}`);
    // React memisahkan simpul teks yang bersebelahan dengan komentar
    // `<!-- -->`, jadi "Diperbarui" dan nilainya tidak bersebelahan di HTML.
    const bersih = html.replace(/<!--[\s\S]*?-->/g, "");
    expect(bersih).toMatch(/Diperbarui\s*(baru saja|\d+\s*(menit|jam|hari) lalu)/);
  });

  it("posisi yang sudah lewat 6 jam ditandai mungkin tidak terkini", async () => {
    await db.penugasan.update({
      where: { id: penugasanId },
      data: { lokasiPada: new Date(Date.now() - 8 * 60 * 60_000) },
    });

    const { html } = await buka(`nop=${nosamb}&hp=${HP}`);
    expect(html).toContain("mungkin sudah tidak terkini");
  });
});

describe("L2 · identitas petugas TIDAK ikut bocor", () => {
  it("nama sopir dan nomor polisi tidak ada di halaman publik", async () => {
    // Pelapor perlu tahu airnya sampai mana, bukan siapa yang membawanya.
    const { html } = await buka(`nop=${nosamb}&hp=${HP}`);
    expect(html).toContain("Posisi armada");
    expect(html).not.toContain(SOPIR_UJI);
    expect(html).not.toContain(NOPOL_UJI);
  });
});

describe("L3 · penugasan yang sudah ditutup", () => {
  it("posisinya tidak lagi ditampilkan sebagai posisi berjalan", async () => {
    await db.penugasan.update({
      where: { id: penugasanId },
      data: { status: "SELESAI", lokasiTeks: "Sudah kembali ke pool", lokasiPada: new Date() },
    });

    const { html } = await buka(`nop=${nosamb}&hp=${HP}`);
    expect(html).not.toContain("Sudah kembali ke pool");
  });
});
