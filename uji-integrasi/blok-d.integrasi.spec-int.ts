/**
 * Blok D3 — Issue #6, tautan lacak bertanda tangan.
 *
 * Token dibuat dengan kunci yang sama seperti aplikasi (dibaca dari .env),
 * lalu diadu ke halaman /lacak yang benar-benar berjalan di localhost:3000.
 */
import { describe, expect, it } from "vitest";

import { createTrackingToken, verifyTrackingToken, TRACKING_LINK_TTL_MS } from "@/lib/tanki/tracking-link";

const APP = "http://localhost:3000";
const NO_TIKET = "TJ-UJI-0001";

async function bukaLacak(t: string) {
  const r = await fetch(`${APP}/lacak?t=${encodeURIComponent(t)}`, {
    headers: { "X-Forwarded-For": "77.77.77.77, 203.0.113.200" },
  });
  return { status: r.status, html: await r.text() };
}

describe("D3 · tautan lacak bertanda tangan (Issue #6)", () => {
  it("tautan yang sah bisa dibuka dan menampilkan tiketnya", async () => {
    const token = createTrackingToken(NO_TIKET);

    // Sanity: verifier internal menerimanya.
    const v = verifyTrackingToken(token);
    expect(v.ok).toBe(true);
    expect(v.ok && v.noTiket).toBe(NO_TIKET);

    const { status, html } = await bukaLacak(token);
    expect(status).toBe(200);
    expect(html).toContain(NO_TIKET);
    expect(html).not.toContain("sudah kedaluwarsa");
  });

  it("tautan yang sudah lewat TTL ditolak sebagai kedaluwarsa", async () => {
    // Dibuat dengan waktu 15 hari lalu; TTL bawaan 14 hari.
    const lampau = new Date(Date.now() - (TRACKING_LINK_TTL_MS + 24 * 60 * 60 * 1000));
    const token = createTrackingToken(NO_TIKET, lampau);

    const v = verifyTrackingToken(token);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.reason).toBe("expired");

    const { status, html } = await bukaLacak(token);
    expect(status).toBe(200);
    expect(html).toContain("sudah kedaluwarsa");
    expect(html).not.toContain(NO_TIKET); // tiket tidak ikut ditampilkan
  });

  it("tanda tangan yang dirusak ditolak sebagai tidak sah", async () => {
    const token = createTrackingToken(NO_TIKET);
    // Rusak satu karakter di TENGAH. Mengubah karakter terakhir base64url bisa
    // saja tidak mengubah satu bit pun (bit sisa tidak terpakai), sehingga token
    // yang "dirusak" tetap sah — itu menguji hal yang salah.
    const tengah = Math.floor(token.length / 2);
    const ganti = token[tengah] === "A" ? "B" : "A";
    const rusak = token.slice(0, tengah) + ganti + token.slice(tengah + 1);

    const v = verifyTrackingToken(rusak);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.reason).toBe("invalid");

    const { html } = await bukaLacak(rusak);
    expect(html).not.toContain(NO_TIKET);
  });

  it("token untuk tiket lain tidak bisa dipakai menebak tiket ini", async () => {
    // Nomor tiket ikut ditandatangani, jadi token TJ-UJI-0002 hanya membuka
    // TJ-UJI-0002 — tidak bisa dipakai untuk melihat TJ-UJI-0001.
    const token = createTrackingToken("TJ-UJI-0002");
    const { html } = await bukaLacak(token);

    expect(html).toContain("TJ-UJI-0002");
    expect(html).not.toContain(NO_TIKET);
  });
});

/**
 * D1 & D2 — diperiksa dari sumber yang tidak bisa berbohong: kunci rate limit
 * di Redis, dan general_log MySQL. Memeriksa HTML saja akan lolos-palsu untuk
 * keduanya.
 */
import { execFileSync } from "node:child_process";

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

describe("D1 · membuka form tidak memakan jatah throttle (Issue #6)", () => {
  it("10x buka /lacak tanpa query tidak membuat satu pun kunci rate limit", async () => {
    redis("FLUSHALL");

    for (let i = 0; i < 10; i++) {
      const r = await fetch(`${APP}/lacak`, {
        headers: { "X-Forwarded-For": "5.5.5.5, 203.0.113.99" },
      });
      expect(r.status).toBe(200);
    }
    expect(redis("KEYS", "lacak:ip:*")).toBe("");

    // Pembanding: sekali dengan query, kunci harus muncul.
    await fetch(`${APP}/lacak?nop=197600001&hp=081234567890`, {
      headers: { "X-Forwarded-For": "5.5.5.5, 203.0.113.99" },
    });
    expect(redis("KEYS", "lacak:ip:*")).toBe("lacak:ip:203.0.113.99");
  });
});

describe("D2 · catatan internal operator tidak tertarik dari database (Issue #6)", () => {
  it("query ke tiket_riwayat tidak pernah membaca catatan yang belum publik", async () => {
    redis("FLUSHALL");
    mulaiRekamQuery();
    const html = await (
      await fetch(`${APP}/lacak?nop=197600001&hp=081234567890`, {
        headers: { "X-Forwarded-For": "6.6.6.6, 203.0.113.98" },
      })
    ).text();
    const log = hentikanRekamQuery();

    // Catatan yang ditandai publik tampil; yang internal tidak.
    expect(html).toContain("Permintaan diterima petugas loket");
    expect(html).not.toContain("RAHASIAINTERNALJANGANBOCOR");

    // Dan yang menentukan ada di SQL-nya, bukan di penyaringan saat render.
    const riwayat = log.split("\n").filter((b) => b.includes("tiket_riwayat"));
    expect(riwayat.length).toBeGreaterThan(0);
    for (const q of riwayat) {
      expect(q).toMatch(/CASE WHEN catatan_publik/);
    }

    // Query tiket tidak ikut menarik kontak pelapor.
    const tiket = log.split("\n").filter((b) => /SELECT .*FROM `tiket`/.test(b));
    expect(tiket.length).toBeGreaterThan(0);
    for (const q of tiket) {
      // Hanya daftar kolomnya yang diperiksa. `no_hp` memang muncul di WHERE —
      // itu kunci pencarian yang diketik pelapor sendiri, bukan kolom yang
      // ikut terbaca keluar.
      const daftarKolom = q.slice(q.indexOf("SELECT"), q.indexOf(" FROM "));
      expect(daftarKolom).not.toMatch(/`email`/);
      expect(daftarKolom).not.toMatch(/`no_hp`/);
      expect(daftarKolom).not.toMatch(/`nama_snapshot`/);
    }
  });
});

/**
 * Checklist Issue #6: "Return an identical response for 'no match' and
 * 'malformed' so timing/shape does not distinguish them."
 */
describe("D4 · respons identik untuk no-match dan malformed (Issue #6)", () => {
  const ambil = async (qs: string) => {
    const r = await fetch(`${APP}/lacak?${qs}`, {
      headers: { "X-Forwarded-For": "4.4.4.4, 203.0.113.44" },
    });
    return { status: r.status, html: await r.text() };
  };

  it("bentuk balasannya sama persis, dan sama-sama tidak menyentuh database", async () => {
    redis("FLUSHALL");

    // Berbentuk benar tapi tidak ada di database.
    const noMatch = await ambil("nop=999999999&hp=081999999999");
    // Tidak berbentuk: nop kurang digit, hp tidak diawali 0.
    const malformed = await ambil("nop=12&hp=629999999");

    expect(noMatch.status).toBe(malformed.status);

    const PESAN = "Tidak ada permintaan yang cocok dengan data tersebut.";
    expect(noMatch.html).toContain(PESAN);
    expect(malformed.html).toContain(PESAN);

    // Tidak ada pesan yang membocorkan bahwa yang gagal adalah bentuknya.
    expect(malformed.html).not.toMatch(/[Ff]ormat .*tidak valid/);

    // Kedua balasan identik setelah dinormalkan. Yang dinormalkan hanya hal yang
    // memang wajar berbeda dan tidak membawa informasi: nilai input yang diketik
    // pengguna sendiri, dan identitas request acak yang disuntikkan Next dalam
    // mode dev (`self.__next_r`, nonce, URL chunk HMR).
    const normal = (h: string) =>
      h
        .replace(/value="[^"]*"/g, 'value=""')
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    expect(normal(malformed.html)).toBe(normal(noMatch.html));
  });

  it("input malformed tidak pernah sampai ke database", async () => {
    redis("FLUSHALL");
    mulaiRekamQuery();
    await ambil("nop=12&hp=629999999");
    const log = hentikanRekamQuery();

    const kueriTiket = log.split("\n").filter((b) => /SELECT .*FROM `tiket`/.test(b));
    expect(kueriTiket).toHaveLength(0);
  });
});
