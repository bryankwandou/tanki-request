import { describe, expect, it } from "vitest";
import {
  MAKS_ENTRI,
  bacaRiwayat,
  hapusEntri,
  tambahEntri,
  tautanLacak,
  type EntriRiwayat,
} from "./riwayat-lokal";

const entri = (noTiket: string, disimpanPada = 1): EntriRiwayat => ({
  noTiket,
  noPelanggan: "197600003",
  disimpanPada,
});

describe("bacaRiwayat — isi localStorage tidak boleh dipercaya", () => {
  it("kosong / null menghasilkan daftar kosong", () => {
    expect(bacaRiwayat(null)).toEqual([]);
    expect(bacaRiwayat("")).toEqual([]);
  });

  it("JSON rusak tidak melempar", () => {
    // Halaman lacak harus tetap render walau riwayatnya kacau.
    expect(bacaRiwayat("{bukan json")).toEqual([]);
    expect(bacaRiwayat('"string"')).toEqual([]);
    expect(bacaRiwayat("42")).toEqual([]);
  });

  it("entri yang tidak berbentuk dibuang, yang sah dipertahankan", () => {
    const raw = JSON.stringify([
      entri("TJ-20260807-00R7"),
      { noTiket: 123 },
      null,
      { noTiket: "TJ-X", noPelanggan: "1", disimpanPada: "kemarin" },
      entri("TJ-20260808-ZZZZ", 2),
    ]);
    expect(bacaRiwayat(raw).map((e) => e.noTiket)).toEqual([
      "TJ-20260807-00R7",
      "TJ-20260808-ZZZZ",
    ]);
  });

  it("daftar yang terlalu panjang dipotong", () => {
    const raw = JSON.stringify(
      Array.from({ length: 50 }, (_, i) => entri(`TJ-${i}`, i)),
    );
    expect(bacaRiwayat(raw)).toHaveLength(MAKS_ENTRI);
  });
});

describe("tambahEntri", () => {
  it("entri terbaru berada di paling depan", () => {
    const d = tambahEntri([entri("A")], entri("B", 2));
    expect(d.map((e) => e.noTiket)).toEqual(["B", "A"]);
  });

  it("nomor tiket yang sama tidak berlipat, hanya diperbarui", () => {
    const d = tambahEntri([entri("A", 1), entri("B", 2)], entri("A", 9));
    expect(d.map((e) => e.noTiket)).toEqual(["A", "B"]);
    expect(d[0].disimpanPada).toBe(9);
  });

  it("tidak mengubah daftar masukannya", () => {
    const awal = [entri("A")];
    tambahEntri(awal, entri("B"));
    expect(awal).toHaveLength(1);
  });

  it("yang paling lama dibuang saat melewati batas", () => {
    let d: EntriRiwayat[] = [];
    for (let i = 0; i < MAKS_ENTRI + 3; i++) d = tambahEntri(d, entri(`TJ-${i}`, i));
    expect(d).toHaveLength(MAKS_ENTRI);
    expect(d[0].noTiket).toBe(`TJ-${MAKS_ENTRI + 2}`);
    expect(d.some((e) => e.noTiket === "TJ-0")).toBe(false);
  });
});

describe("hapusEntri", () => {
  it("membuang hanya tiket yang diminta", () => {
    expect(hapusEntri([entri("A"), entri("B")], "A").map((e) => e.noTiket)).toEqual(["B"]);
  });
});

describe("tautanLacak", () => {
  it("menunjuk ke jalur 'No. Tiket + No. Pelanggan', bukan nomor tiket saja", () => {
    const url = tautanLacak(entri("TJ-20260807-00R7"));
    expect(url).toBe("/lacak?mode=tiket&tiket=TJ-20260807-00R7&nop=197600003");
  });

  it("nilai aneh tetap ter-encode, tidak bocor mentah ke query string", () => {
    const url = tautanLacak({ noTiket: "A&b=c", noPelanggan: "1 2", disimpanPada: 0 });
    expect(url).not.toContain("A&b=c");
    expect(url).toContain("A%26b%3Dc");
  });
});
