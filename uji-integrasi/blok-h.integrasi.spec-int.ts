/**
 * Blok H — fitur yang lahir dari "Laporan Review UX & Keamanan" (7 Agu 2026).
 *
 * Tiga butir yang benar-benar mengubah perilaku server diuji di sini terhadap
 * MySQL, Redis, dan halaman /lacak yang benar-benar berjalan:
 *
 *   3.4  cooldown antar pengajuan per No. Pelanggan
 *   3.7  jalur lacak "No. Tiket + No. Pelanggan"
 *   3.1  navigasi kembali di halaman lacak
 *
 * Butir 3.3 (salin nomor tiket & riwayat perangkat) sepenuhnya hidup di
 * localStorage peramban — tidak ada jejaknya di server, jadi ia dibuktikan
 * unit test (`riwayat-lokal.test.ts`), bukan di sini.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

import { db } from "@/lib/db";
import { setConfig } from "@/lib/tanki/config";
import { genNoTiket } from "@/lib/tanki/no-tiket";
import { createTiket } from "@/lib/tanki/tiket";

const APP = "http://localhost:3000";

const redis = (...args: string[]) =>
  execFileSync("docker", ["exec", "tanki-redis", "redis-cli", ...args]).toString().trim();

const mysql = (sql: string) =>
  execFileSync("docker", [
    "exec", "tanki-mysql", "mysql", "-uroot", "-prootpass", "-N", "-e", sql,
  ]).toString();

function mulaiRekamQuery() {
  mysql("SET GLOBAL log_output='TABLE'; SET GLOBAL general_log=1; TRUNCATE TABLE mysql.general_log;");
}
function hentikanRekamQuery(): string {
  mysql("SET GLOBAL general_log=0;");
  return mysql(
    "SELECT CONVERT(argument USING utf8mb4) FROM mysql.general_log WHERE command_type IN ('Execute','Query');",
  );
}

/** Nomor sambungan asli yang belum punya tiket sama sekali. */
let pool: string[] = [];
let idx = 0;
const berikutnya = () => pool[idx++];

/** Tiket yang dibuat blok ini, supaya bisa dibersihkan di akhir. */
const dibuat: string[] = [];

async function buatTiket(nosamb: string) {
  const r = await createTiket({
    noPelanggan: nosamb,
    noHp: "081200000009",
    email: `uji-h-${nosamb}@example.com`,
    keluhan: "uji integrasi blok H",
  });
  if (r.ok) dibuat.push(r.noTiket);
  return r;
}

/** Geser `created_at` tiket ke masa lalu untuk menguji ujung jendela cooldown. */
async function mundurkanTiket(noTiket: string, jam: number) {
  await db.$executeRawUnsafe(
    `UPDATE tiket SET created_at = DATE_SUB(NOW(), INTERVAL ? HOUR) WHERE no_tiket = ?`,
    jam,
    noTiket,
  );
}

const buka = async (qs: string, ip = "9.9.9.9") => {
  const r = await fetch(`${APP}/lacak?${qs}`, {
    headers: { "X-Forwarded-For": `${ip}, 203.0.113.77` },
  });
  return { status: r.status, html: await r.text() };
};

const TIDAK_COCOK = "Tidak ada permintaan yang cocok dengan data tersebut.";

/**
 * Penanda bahwa kartu tiket BENAR-BENAR ditampilkan.
 *
 * Memeriksa nomor tiket saja tidak cukup: form GET memantulkan kembali apa yang
 * diketik pengguna lewat `defaultValue`, jadi nomor tiket muncul di HTML bahkan
 * saat pencariannya gagal. Keluhan hanya keluar dari database.
 */
const KELUHAN = "uji integrasi blok H";

beforeAll(async () => {
  const rows = await db.$queryRawUnsafe<{ nosamb: string }[]>(
    `SELECT p.nosamb FROM pelanggan p
       LEFT JOIN tiket t ON t.no_pelanggan = p.nosamb
      WHERE t.id IS NULL
      LIMIT 50`,
  );
  pool = rows.map((r) => r.nosamb);
  expect(pool.length).toBeGreaterThan(10);

  // Nilai bawaan untuk blok ini; kasus yang butuh nilai lain mengubahnya sendiri.
  await setConfig({ submit_cooldown_hours: "24" });
});

afterAll(async () => {
  await setConfig({ submit_cooldown_hours: "24" });
  if (dibuat.length) {
    await db.tiket.deleteMany({ where: { noTiket: { in: dibuat } } });
  }
});

beforeEach(() => {
  redis("FLUSHALL");
});

describe("H1 · cooldown antar pengajuan (butir 3.4)", () => {
  it("tiket sebelumnya SUDAH ditutup pun tidak membuka pengajuan baru seketika", async () => {
    const nosamb = berikutnya();
    const pertama = await buatTiket(nosamb);
    expect(pertama.ok).toBe(true);

    // Tutup tiketnya — guard "masih ada permintaan aktif" tidak lagi berlaku.
    await db.tiket.updateMany({
      where: { noPelanggan: nosamb },
      data: { status: "SELESAI" },
    });

    const kedua = await buatTiket(nosamb);
    expect(kedua.ok).toBe(false);
    // Pesannya harus soal jeda, bukan soal "permintaan aktif" —
    // itu yang membuktikan cooldown-lah yang menahan, bukan guard lama.
    expect(!kedua.ok && kedua.error).toMatch(/baru saja mengajukan/i);
    expect(!kedua.ok && kedua.error).not.toMatch(/permintaan aktif/i);
  });

  it("membatalkan permintaan sendiri tidak mereset jatah", async () => {
    const nosamb = berikutnya();
    expect((await buatTiket(nosamb)).ok).toBe(true);
    await db.tiket.updateMany({
      where: { noPelanggan: nosamb },
      data: { status: "DIBATALKAN" },
    });

    const kedua = await buatTiket(nosamb);
    expect(kedua.ok).toBe(false);
    expect(!kedua.ok && kedua.error).toMatch(/baru saja mengajukan/i);
  });

  it("setelah jendela terlewati, pengajuan baru diterima lagi", async () => {
    const nosamb = berikutnya();
    const pertama = await buatTiket(nosamb);
    expect(pertama.ok).toBe(true);

    await db.tiket.updateMany({
      where: { noPelanggan: nosamb },
      data: { status: "SELESAI" },
    });
    await mundurkanTiket(pertama.ok ? pertama.noTiket : "", 25);

    const kedua = await buatTiket(nosamb);
    expect(kedua.ok, !kedua.ok ? kedua.error : "").toBe(true);
  });

  it("cooldown 0 mematikan fitur, bukan menolak semua pengajuan", async () => {
    // Admin harus bisa mematikannya saat krisis air.
    await setConfig({ submit_cooldown_hours: "0" });
    try {
      const nosamb = berikutnya();
      expect((await buatTiket(nosamb)).ok).toBe(true);
      await db.tiket.updateMany({
        where: { noPelanggan: nosamb },
        data: { status: "SELESAI" },
      });
      const kedua = await buatTiket(nosamb);
      expect(kedua.ok, !kedua.ok ? kedua.error : "").toBe(true);
    } finally {
      await setConfig({ submit_cooldown_hours: "24" });
    }
  });
});

describe("H2 · lacak dengan Nomor Tiket (butir 3.7)", () => {
  let noTiket = "";
  let nosamb = "";

  beforeAll(async () => {
    nosamb = berikutnya();
    const r = await buatTiket(nosamb);
    if (!r.ok) throw new Error(`gagal menyiapkan tiket: ${r.error}`);
    noTiket = r.noTiket;
  });

  it("nomor tiket + No. Pelanggan yang benar menampilkan tiketnya", async () => {
    const { status, html } = await buka(`mode=tiket&tiket=${noTiket}&nop=${nosamb}`);
    expect(status).toBe(200);
    expect(html).toContain(noTiket);
    expect(html).toContain(KELUHAN);
    expect(html).not.toContain(TIDAK_COCOK);
  });

  it("NOMOR TIKET SAJA tidak membuka apa pun", async () => {
    // Inti pengamannya: sufiks tiket cuma empat karakter, jadi jalur ini tidak
    // boleh bisa dipakai memanen data pelapor dengan menebak.
    const { html } = await buka(`mode=tiket&tiket=${noTiket}`);
    expect(html).not.toContain(KELUHAN);
    expect(html).toContain(TIDAK_COCOK);
  });

  it("nomor tiket benar + No. Pelanggan milik orang lain ditolak", async () => {
    const { html } = await buka(`mode=tiket&tiket=${noTiket}&nop=197600001`);
    expect(html).not.toContain(KELUHAN);
    // Tiket 197600001 yang sah pun tidak ikut bocor lewat jalur ini.
    expect(html).not.toContain("TJ-UJI-0001");
    expect(html).toContain(TIDAK_COCOK);
  });

  it("nomor tiket yang tidak berbentuk tidak pernah sampai ke database", async () => {
    mulaiRekamQuery();
    const { html } = await buka(`mode=tiket&tiket=BUKAN-TIKET&nop=${nosamb}`);
    const log = hentikanRekamQuery();

    expect(html).toContain(TIDAK_COCOK);
    // Respons untuk bentuk salah harus setara no-match — tanpa pesan yang
    // memberi tahu penebak bahwa yang salah adalah bentuknya (Issue #6).
    expect(html).not.toMatch(/[Ff]ormat .*tidak valid/);
    expect(log.split("\n").filter((b) => /SELECT .*FROM `tiket`/.test(b))).toHaveLength(0);
  });

  it("nomor tiket yang berbentuk benar tapi tidak ada: sama persis dengan no-match", async () => {
    const acak = genNoTiket();
    const tidakAda = await buka(`mode=tiket&tiket=${acak}&nop=${nosamb}`);
    const salahBentuk = await buka(`mode=tiket&tiket=BUKAN-TIKET&nop=${nosamb}`);

    const normal = (h: string) =>
      h
        .replace(/value="[^"]*"/g, 'value=""')
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    expect(normal(tidakAda.html)).toBe(normal(salahBentuk.html));
  });

  it("jalur tiket punya bucket throttle sendiri, terpisah dari jalur normal", async () => {
    // Kalau keduanya berbagi bucket, penebakan nomor tiket ikut menghabiskan
    // jatah warga yang melacak dengan cara biasa.
    redis("FLUSHALL");
    await buka(`mode=tiket&tiket=${noTiket}&nop=${nosamb}`, "9.8.7.6");
    expect(redis("KEYS", "lacak:tiket:ip:*")).toBe("lacak:tiket:ip:203.0.113.77");
  });

  it("11 tebakan beruntun di jalur tiket kena throttle sebelum jalur normal", async () => {
    redis("FLUSHALL");
    let terakhir = { html: "" };
    for (let i = 0; i < 11; i++) {
      terakhir = await buka(`mode=tiket&tiket=${genNoTiket()}&nop=${nosamb}`, "9.8.7.5");
    }
    expect(terakhir.html).toContain("Terlalu banyak pencarian");

    // Jalur No. Pelanggan + No. HP dari IP yang sama masih dilayani: batas 30-nya
    // belum habis, jadi warga biasa tidak ikut terkunci.
    const normal = await buka(`nop=${nosamb}&hp=081200000009`, "9.8.7.5");
    expect(normal.html).not.toContain("Terlalu banyak pencarian");
  });
});

describe("H3 · navigasi kembali di halaman lacak (butir 3.1)", () => {
  it("halaman lacak menawarkan jalan kembali ke beranda tanpa tombol back peramban", async () => {
    const { html } = await buka("");
    expect(html).toContain("Kembali ke Beranda");
    expect(html).toMatch(/href="\/"/);
  });

  it("kedua jalur pencarian ditawarkan sebagai pilihan yang terlihat", async () => {
    const { html } = await buka("");
    expect(html).toContain("Nomor Tiket");
    expect(html).toContain("No. Pelanggan + No. HP");
  });
});
