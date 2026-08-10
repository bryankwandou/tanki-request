import { describe, expect, it } from "vitest";
import { evaluateCooldown, formatSisaWaktu } from "./pengajuan-guard";

const JAM = 60 * 60_000;
const NOW = new Date("2026-08-10T12:00:00Z").getTime();

describe("cooldown antar pengajuan (butir 3.4)", () => {
  it("pelanggan yang belum pernah mengajukan selalu boleh", () => {
    expect(evaluateCooldown(null, NOW, 24)).toEqual({ allow: true });
  });

  it("pengajuan kedua di dalam jendela ditolak", () => {
    const r = evaluateCooldown(new Date(NOW - 2 * JAM), NOW, 24);
    expect(r.allow).toBe(false);
    expect(!r.allow && r.retryAfterMs).toBe(22 * JAM);
  });

  it("tepat di ujung jendela sudah boleh", () => {
    expect(evaluateCooldown(new Date(NOW - 24 * JAM), NOW, 24)).toEqual({ allow: true });
    expect(evaluateCooldown(new Date(NOW - 25 * JAM), NOW, 24)).toEqual({ allow: true });
  });

  it("0 jam berarti cooldown dimatikan, bukan 'tolak selamanya'", () => {
    // Admin memang harus bisa mematikannya saat krisis air.
    expect(evaluateCooldown(new Date(NOW - 1000), NOW, 0)).toEqual({ allow: true });
  });

  it("nilai jam yang rusak tidak mengunci pelanggan", () => {
    expect(evaluateCooldown(new Date(NOW - 1000), NOW, NaN)).toEqual({ allow: true });
    expect(evaluateCooldown(new Date(NOW - 1000), NOW, -5)).toEqual({ allow: true });
  });

  it("tanggal di masa depan tidak mengunci pelanggan selamanya", () => {
    // Jam server bergeser atau baris diedit manual — jangan sampai pelanggan
    // tidak bisa mengajukan apa pun sampai tanggal itu terlewati.
    expect(evaluateCooldown(new Date(NOW + 1000 * JAM), NOW, 24)).toEqual({ allow: true });
  });

  it("pesannya menyebutkan sisa waktu, bukan sekadar 'coba lagi nanti'", () => {
    const r = evaluateCooldown(new Date(NOW - 23 * JAM), NOW, 24);
    expect(!r.allow && r.error).toContain("1 jam");
  });
});

describe("formatSisaWaktu — dibulatkan ke ATAS", () => {
  it("membulatkan ke atas supaya pengguna tidak tertolak dua kali", () => {
    // 90 detik yang dibulatkan ke bawah jadi "1 menit" membuat pengguna yang
    // menunggu tepat 1 menit tertolak lagi.
    expect(formatSisaWaktu(90_000)).toBe("2 menit");
    expect(formatSisaWaktu(59 * 60_000)).toBe("59 menit");
    expect(formatSisaWaktu(90 * 60_000)).toBe("2 jam");
    expect(formatSisaWaktu(23 * JAM)).toBe("23 jam");
    expect(formatSisaWaktu(30 * JAM)).toBe("2 hari");
  });
});
