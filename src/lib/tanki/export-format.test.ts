import { describe, expect, it } from "vitest";
import { csvCell, guardFormula, toCsv } from "./export-format";

const KOLOM = [
  { key: "noTiket" as const, label: "No. Tiket" },
  { key: "nama" as const, label: "Nama" },
];

describe("CSV injection (Issue #1)", () => {
  it("sel yang diawali karakter formula dinetralkan", () => {
    // Nama dan alamat berasal dari input publik, jadi ini jalur nyata.
    for (const jahat of ["=1+1", "+1", "-1", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(guardFormula(jahat).startsWith("'")).toBe(true);
    }
  });

  it("=cmd|'/c calc'!A0 tidak lagi dieksekusi Excel", () => {
    expect(csvCell("=cmd|'/c calc'!A0")).toBe("'=cmd|'/c calc'!A0");
  });

  it("teks biasa tidak diubah", () => {
    expect(guardFormula("Jl. Andi Djemma 12")).toBe("Jl. Andi Djemma 12");
    expect(guardFormula("TJ-20260729-0001")).toBe("TJ-20260729-0001");
  });
});

describe("escaping CSV", () => {
  it("koma, kutip, dan baris baru dibungkus dengan benar", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('dia bilang "halo"')).toBe('"dia bilang ""halo"""');
    expect(csvCell("baris1\nbaris2")).toBe('"baris1\nbaris2"');
  });
});

describe("bentuk berkas", () => {
  it("header + satu baris per data, dipisah CRLF", () => {
    const csv = toCsv([{ noTiket: "TJ-1", nama: "Budi" }], KOLOM);
    expect(csv).toBe("No. Tiket,Nama\r\nTJ-1,Budi\r\n");
  });

  it("jumlah baris berkas sama dengan jumlah data", () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ noTiket: `TJ-${i}`, nama: "x" }));
    const baris = toCsv(rows, KOLOM).trimEnd().split("\r\n");
    expect(baris.length - 1).toBe(25); // dikurangi header
  });

  it("nilai kosong tidak menggeser kolom", () => {
    const csv = toCsv([{ noTiket: "TJ-1", nama: "" }], KOLOM);
    expect(csv.trimEnd().split("\r\n")[1]).toBe("TJ-1,");
  });
});
