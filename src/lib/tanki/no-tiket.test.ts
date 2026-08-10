import { describe, expect, it } from "vitest";
import { NO_TIKET_RE, RUANG_SUFIKS_TIKET, genNoTiket } from "./no-tiket";

/** Sufiks = empat karakter terakhir nomor tiket. */
const sufiks = () => genNoTiket().slice(-4);

describe("entropi nomor tiket", () => {
  it("ruang sufiks memakai keempat posisi base36, bukan dua", () => {
    // Bug lama: Math.random() * 1296 → base36 maksimal 'ZZ', jadi dua posisi
    // pertama selalu '00' dan hanya ada 1.296 nomor per tanggal.
    expect(RUANG_SUFIKS_TIKET).toBe(1_679_616);
    expect(RUANG_SUFIKS_TIKET).toBeGreaterThan(1296 * 1000);
  });

  it("dua posisi pertama tidak lagi selalu '00'", () => {
    const contoh = Array.from({ length: 500 }, sufiks);
    expect(contoh.some((s) => !s.startsWith("00"))).toBe(true);
    // Dan sebagian besarnya memang bukan '00' (peluang '00' hanya 1/1296).
    expect(contoh.filter((s) => s.startsWith("00")).length).toBeLessThan(10);
  });

  it("selalu tepat 4 karakter dan cocok dengan pola yang dipakai halaman lacak", () => {
    for (let i = 0; i < 500; i++) {
      const s = sufiks();
      expect(s).toHaveLength(4);
      expect(`TJ-20260807-${s}`).toMatch(NO_TIKET_RE);
    }
  });

  it("1000 nomor berturut-turut nyaris tanpa tabrakan", () => {
    const set = new Set(Array.from({ length: 1000 }, sufiks));
    // Dengan ruang 1.296 (bug lama) 1000 undian menyisakan ~600 nilai unik.
    expect(set.size).toBeGreaterThan(980);
  });
});
