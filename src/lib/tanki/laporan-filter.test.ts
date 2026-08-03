import { describe, expect, it } from "vitest";
import {
  MAX_RANGE_DAYS,
  exportFilename,
  parseLaporanFilter,
} from "./laporan-filter";

// 15 Juli 2026, 02:00 UTC = 10:00 WITA.
const NOW = new Date("2026-07-15T02:00:00.000Z");
// 15 Juli 2026, 17:30 UTC = 16 Juli 01:30 WITA — sudah ganti hari di Makassar.
const NOW_MALAM = new Date("2026-07-15T17:30:00.000Z");

describe("rentang tanggal laporan (Issue #1)", () => {
  it("default: 30 hari terakhir sampai hari ini", () => {
    const f = parseLaporanFilter({}, NOW);
    expect(f.toLabel).toBe("2026-07-15");
    expect(f.fromLabel).toBe("2026-06-16");
  });

  it("'hari ini' mengikuti WITA, bukan zona server", () => {
    // Server UTC masih 15 Juli, tapi di Makassar sudah 16 Juli.
    expect(parseLaporanFilter({}, NOW_MALAM).toLabel).toBe("2026-07-16");
  });

  it("tanggal akhir bersifat inklusif — batas atas query adalah awal hari berikutnya", () => {
    // Ini sumber salah hitung paling umum: memakai awal hari terakhir sebagai
    // batas atas akan membuang seluruh tiket yang dibuat pada hari itu.
    const f = parseLaporanFilter({ from: "2026-07-01", to: "2026-07-01" }, NOW);
    expect(f.start.toISOString()).toBe("2026-06-30T16:00:00.000Z"); // 1 Juli 00:00 WITA
    expect(f.endExclusive.toISOString()).toBe("2026-07-01T16:00:00.000Z"); // 2 Juli 00:00 WITA
    expect(f.endExclusive.getTime() - f.start.getTime()).toBe(86_400_000);
  });

  it("tanggal terbalik ditukar, bukan menghasilkan nol baris", () => {
    const f = parseLaporanFilter({ from: "2026-07-10", to: "2026-07-01" }, NOW);
    expect([f.fromLabel, f.toLabel]).toEqual(["2026-07-01", "2026-07-10"]);
  });

  it("rentang berlebihan dipotong dari sisi awal", () => {
    const f = parseLaporanFilter({ from: "2000-01-01", to: "2026-07-15" }, NOW);
    expect(f.toLabel).toBe("2026-07-15");
    const hari = (f.endExclusive.getTime() - f.start.getTime()) / 86_400_000;
    expect(hari).toBe(MAX_RANGE_DAYS);
  });

  it("tanggal ngawur jatuh ke default, tidak melempar", () => {
    const f = parseLaporanFilter({ from: "bukan-tanggal", to: "13/07/2026" }, NOW);
    expect(f.fromLabel).toBe("2026-06-16");
    expect(f.toLabel).toBe("2026-07-15");
  });
});

describe("filter dimensi", () => {
  it("status di luar enum diabaikan", () => {
    expect(parseLaporanFilter({ status: "SELESAI" }, NOW).status).toBe("SELESAI");
    expect(parseLaporanFilter({ status: "DROP TABLE" }, NOW).status).toBeNull();
    expect(parseLaporanFilter({ status: "selesai" }, NOW).status).toBeNull();
  });

  it("wilayah harus dua digit", () => {
    expect(parseLaporanFilter({ wil: "04" }, NOW).wil).toBe("04");
    expect(parseLaporanFilter({ wil: "4" }, NOW).wil).toBeNull();
    expect(parseLaporanFilter({ wil: "04' OR '1'='1" }, NOW).wil).toBeNull();
  });

  it("rayon hanya angka, maksimal tujuh digit", () => {
    expect(parseLaporanFilter({ rayon: "040402" }, NOW).rayon).toBe("040402");
    expect(parseLaporanFilter({ rayon: "12345678" }, NOW).rayon).toBeNull();
    expect(parseLaporanFilter({ rayon: "abc" }, NOW).rayon).toBeNull();
  });
});

describe("nama berkas ekspor", () => {
  it("mencerminkan periode dan filter yang dipakai", () => {
    const f = parseLaporanFilter(
      { from: "2026-07-01", to: "2026-07-31", status: "SELESAI", wil: "04" },
      NOW,
    );
    expect(exportFilename(f, "xlsx")).toBe(
      "laporan-tanki_2026-07-01_sd_2026-07-31_selesai_wil04.xlsx",
    );
  });

  it("tanpa filter tambahan hanya memuat periode", () => {
    const f = parseLaporanFilter({ from: "2026-07-01", to: "2026-07-31" }, NOW);
    expect(exportFilename(f, "csv")).toBe("laporan-tanki_2026-07-01_sd_2026-07-31.csv");
  });
});
