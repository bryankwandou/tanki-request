import { describe, expect, it } from "vitest";
import { parseLacak } from "./lacak-query";

describe("parseLacak — jalur No. Pelanggan + No. HP (perilaku lama)", () => {
  it("tanpa parameter apa pun: kosong, jangan sentuh database", () => {
    expect(parseLacak({})).toEqual({ kind: "kosong" });
    expect(parseLacak({ nop: "  ", hp: "" })).toEqual({ kind: "kosong" });
  });

  it("keduanya berbentuk benar → query pelanggan", () => {
    expect(parseLacak({ nop: "197600003", hp: "082293121272" })).toEqual({
      kind: "pelanggan",
      noPelanggan: "197600003",
      noHp: "082293121272",
    });
  });

  it("bentuk salah → malformed (dirender identik dengan no-match, Issue #6)", () => {
    expect(parseLacak({ nop: "12", hp: "629999999" }).kind).toBe("malformed");
    expect(parseLacak({ nop: "1976000031", hp: "081234567890" }).kind).toBe("malformed");
    // Hanya salah satu terisi juga bukan pencarian yang sah.
    expect(parseLacak({ nop: "197600003" }).kind).toBe("malformed");
  });
});

describe("parseLacak — jalur nomor tiket (butir 3.7)", () => {
  it("nomor tiket + No. Pelanggan → query tiket", () => {
    expect(parseLacak({ mode: "tiket", tiket: "TJ-20260807-00R7", nop: "197600003" })).toEqual({
      kind: "tiket",
      noTiket: "TJ-20260807-00R7",
      noPelanggan: "197600003",
    });
  });

  it("huruf kecil dan spasi hasil salin-tempel dari email tetap cocok", () => {
    const r = parseLacak({ mode: "tiket", tiket: " tj-20260807-00r7 ", nop: "197600003" });
    expect(r).toEqual({
      kind: "tiket",
      noTiket: "TJ-20260807-00R7",
      noPelanggan: "197600003",
    });
  });

  it("NOMOR TIKET SAJA tidak pernah cukup", () => {
    // Ini pengamannya: sufiks tiket hanya empat karakter, jadi 'lacak cukup
    // dengan nomor tiket' akan membuka pemanenan data pelapor lewat tebakan.
    expect(parseLacak({ mode: "tiket", tiket: "TJ-20260807-00R7" }).kind).toBe("malformed");
  });

  it("No. Pelanggan saja, tanpa nomor tiket, juga ditolak", () => {
    expect(parseLacak({ mode: "tiket", nop: "197600003" }).kind).toBe("malformed");
  });

  it("form tiket yang masih kosong tidak menjalankan query apa pun", () => {
    expect(parseLacak({ mode: "tiket" })).toEqual({ kind: "kosong" });
  });

  it("nomor tiket yang tidak berbentuk ditolak sebelum menyentuh database", () => {
    for (const t of ["TJ-2026-0007", "XX-20260807-00R7", "TJ-20260807-00R", "' OR 1=1 --"]) {
      expect(parseLacak({ mode: "tiket", tiket: t, nop: "197600003" }).kind, t).toBe("malformed");
    }
  });

  it("mode yang tidak dikenal jatuh ke jalur lama, bukan ke jalur tiket", () => {
    expect(parseLacak({ mode: "apa-saja", nop: "197600003", hp: "082293121272" }).kind).toBe(
      "pelanggan",
    );
  });
});
