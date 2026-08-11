import { describe, expect, it } from "vitest";
import { BATAS_BASI_MS, parseKoordinat, posisiBasi, tautanPeta, usiaPosisi } from "./lokasi";

describe("parseKoordinat", () => {
  it("kedua kolom kosong = tidak ada koordinat, bukan error", () => {
    expect(parseKoordinat("", "")).toEqual({ ok: true, lat: null, lng: null });
    expect(parseKoordinat("  ", " ")).toEqual({ ok: true, lat: null, lng: null });
  });

  it("koordinat Makassar yang sah diterima", () => {
    // Balai Kota Makassar, kira-kira.
    expect(parseKoordinat("-5.1477", "119.4327")).toEqual({
      ok: true,
      lat: -5.1477,
      lng: 119.4327,
    });
  });

  it("hanya salah satu terisi ditolak", () => {
    // Satu koordinat tanpa pasangannya tidak menunjuk ke mana pun.
    expect(parseKoordinat("-5.1477", "").ok).toBe(false);
    expect(parseKoordinat("", "119.4327").ok).toBe(false);
  });

  it("bukan angka ditolak", () => {
    expect(parseKoordinat("selatan", "timur").ok).toBe(false);
  });

  it("di luar rentang bumi ditolak lebih dulu", () => {
    const r = parseKoordinat("999", "999");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/rentang koordinat bumi/i);
  });

  it("lat/lng tertukar ditolak dengan petunjuk yang benar", () => {
    // Kesalahan paling sering saat menyalin dari aplikasi peta.
    const r = parseKoordinat("119.4327", "-5.1477");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/tertukar/i);
  });

  it("koordinat di luar Makassar ditolak", () => {
    // Jakarta.
    expect(parseKoordinat("-6.2088", "106.8456").ok).toBe(false);
  });
});

describe("usiaPosisi — posisi tanpa keterangan waktu lebih buruk daripada tanpa posisi", () => {
  const NOW = new Date("2026-08-10T12:00:00Z").getTime();
  const lalu = (ms: number) => new Date(NOW - ms);

  it("null saat belum pernah diisi", () => {
    expect(usiaPosisi(null, NOW)).toBeNull();
  });

  it("kurang dari semenit = 'baru saja'", () => {
    expect(usiaPosisi(lalu(30_000), NOW)).toBe("baru saja");
  });

  it("menit, jam, dan hari", () => {
    expect(usiaPosisi(lalu(5 * 60_000), NOW)).toBe("5 menit lalu");
    expect(usiaPosisi(lalu(3 * 60 * 60_000), NOW)).toBe("3 jam lalu");
    expect(usiaPosisi(lalu(50 * 60 * 60_000), NOW)).toBe("2 hari lalu");
  });

  it("stempel waktu di masa depan tidak menghasilkan angka negatif", () => {
    // Jam server/perangkat petugas bisa bergeser.
    expect(usiaPosisi(new Date(NOW + 60_000), NOW)).toBe("baru saja");
  });
});

describe("posisiBasi", () => {
  const NOW = Date.now();

  it("belum pernah diisi dianggap basi", () => {
    expect(posisiBasi(null, NOW)).toBe(true);
  });

  it("baru diperbarui tidak basi", () => {
    expect(posisiBasi(new Date(NOW - 60_000), NOW)).toBe(false);
  });

  it("lewat ambang dianggap basi", () => {
    expect(posisiBasi(new Date(NOW - BATAS_BASI_MS - 1000), NOW)).toBe(true);
  });
});

describe("tautanPeta", () => {
  it("menghasilkan tautan OpenStreetMap dengan penanda di titiknya", () => {
    // Sengaja tautan, bukan peta tertanam: peta tertanam memuat skrip pihak
    // ketiga di halaman publik PDAM dan mengekspos setiap warga yang melacak.
    const url = tautanPeta(-5.1477, 119.4327);
    expect(url).toContain("openstreetmap.org");
    expect(url).toContain("mlat=-5.1477");
    expect(url).toContain("mlon=119.4327");
  });
});
