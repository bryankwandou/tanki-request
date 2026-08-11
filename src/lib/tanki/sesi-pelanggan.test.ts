import { describe, expect, it } from "vitest";
import { UMUR_SESI_MS, bacaSesi, buatSesi } from "./sesi-pelanggan";

const RAHASIA = "rahasia-uji-yang-cukup-panjang";
const LAIN = "rahasia-lain-yang-berbeda-total";
const NOW = new Date("2026-08-10T12:00:00Z").getTime();
const NOP = "197600003";

describe("sesi pelanggan — penerbitan & pembacaan", () => {
  it("sesi yang baru terbit bisa dibaca kembali", () => {
    const c = buatSesi(NOP, NOW, RAHASIA);
    expect(bacaSesi(c, NOW, RAHASIA)).toEqual({ ok: true, nop: NOP });
  });

  it("cookie kosong bukan error, hanya 'belum masuk'", () => {
    expect(bacaSesi(undefined, NOW, RAHASIA)).toEqual({ ok: false, alasan: "kosong" });
    expect(bacaSesi("", NOW, RAHASIA)).toEqual({ ok: false, alasan: "kosong" });
  });
});

describe("sesi pelanggan — tidak bisa dipalsukan", () => {
  it("payload yang diubah ditolak", () => {
    // Inti pengamannya: kalau ini lolos, siapa pun bisa mengetik No. Pelanggan
    // orang lain ke dalam cookie dan membaca riwayat mereka.
    const c = buatSesi(NOP, NOW, RAHASIA);
    const [, sig] = c.split(".");
    const palsu =
      Buffer.from(JSON.stringify({ nop: "197600001", exp: NOW + UMUR_SESI_MS })).toString(
        "base64url",
      ) + `.${sig}`;

    expect(bacaSesi(palsu, NOW, RAHASIA)).toEqual({ ok: false, alasan: "tanda-tangan" });
  });

  it("tanda tangan dari kunci lain ditolak", () => {
    const c = buatSesi(NOP, NOW, LAIN);
    expect(bacaSesi(c, NOW, RAHASIA).ok).toBe(false);
  });

  it("cookie tanpa tanda tangan ditolak", () => {
    const payload = Buffer.from(JSON.stringify({ nop: NOP, exp: NOW + 1000 })).toString(
      "base64url",
    );
    expect(bacaSesi(payload, NOW, RAHASIA).ok).toBe(false);
  });

  it("sampah acak tidak membuat pembacaan melempar", () => {
    for (const s of ["...", "a.b", "{}", "x".repeat(500), "a.".repeat(50)]) {
      expect(() => bacaSesi(s, NOW, RAHASIA)).not.toThrow();
      expect(bacaSesi(s, NOW, RAHASIA).ok).toBe(false);
    }
  });

  it("No. Pelanggan yang tidak berbentuk 9 digit ditolak walau tanda tangannya sah", () => {
    // Menjaga agar nilai aneh tidak diteruskan ke query database.
    const c = buatSesi("bukan-nomor", NOW, RAHASIA);
    expect(bacaSesi(c, NOW, RAHASIA)).toEqual({ ok: false, alasan: "rusak" });
  });
});

describe("sesi pelanggan — kedaluwarsa", () => {
  it("masih berlaku sebelum 30 hari", () => {
    const c = buatSesi(NOP, NOW, RAHASIA);
    expect(bacaSesi(c, NOW + UMUR_SESI_MS - 1000, RAHASIA).ok).toBe(true);
  });

  it("ditolak setelah lewat", () => {
    const c = buatSesi(NOP, NOW, RAHASIA);
    expect(bacaSesi(c, NOW + UMUR_SESI_MS + 1000, RAHASIA)).toEqual({
      ok: false,
      alasan: "kedaluwarsa",
    });
  });

  it("kedaluwarsa tidak bisa diperpanjang klien — ia ikut ditandatangani", () => {
    const c = buatSesi(NOP, NOW, RAHASIA);
    const [payload] = c.split(".");
    const isi = JSON.parse(Buffer.from(payload, "base64url").toString());
    isi.exp = NOW + 10 * UMUR_SESI_MS;
    const diperpanjang =
      Buffer.from(JSON.stringify(isi)).toString("base64url") + "." + c.split(".")[1];

    expect(bacaSesi(diperpanjang, NOW + UMUR_SESI_MS + 1000, RAHASIA).ok).toBe(false);
  });
});
