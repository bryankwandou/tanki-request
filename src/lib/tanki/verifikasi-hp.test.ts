import { describe, expect, it } from "vitest";
import { normalisasiHp, verifikasiHp } from "./verifikasi-hp";

describe("normalisasiHp — bentuk nomor yang bercampur", () => {
  it("menyamakan 0812…, 62812…, dan +62 812-…", () => {
    // Kalau ini tidak disamakan, pelanggan sah ditolak hanya karena petugas
    // loket mengetik dengan gaya berbeda — kegagalan yang jauh lebih sering
    // daripada serangan yang hendak dicegah.
    const target = "081234567890";
    for (const v of [
      "081234567890",
      "6281234567890",
      "+6281234567890",
      "+62 812-3456-7890",
      " 0812 3456 7890 ",
      "0812-3456-7890",
    ]) {
      expect(normalisasiHp(v), v).toBe(target);
    }
  });

  it("nilai kosong / null menghasilkan string kosong, bukan crash", () => {
    expect(normalisasiHp(null)).toBe("");
    expect(normalisasiHp(undefined)).toBe("");
    expect(normalisasiHp("   ")).toBe("");
  });

  it("nomor tanpa awalan 0 diberi awalan, bukan dibiarkan berbeda", () => {
    expect(normalisasiHp("81234567890")).toBe("081234567890");
  });
});

describe("verifikasiHp — mode bertahap (default)", () => {
  it("belum ada kontak terdaftar → diterima (perilaku lama dipertahankan)", () => {
    // Ini yang membuat fitur bisa dipasang hari ini: keamanan naik bertahap
    // seiring PDAM mengisi data, tanpa menunggu 231k baris lengkap.
    expect(verifikasiHp(null, "081234567890", false)).toEqual({
      cocok: true,
      alasan: "belum-ada-data",
    });
  });

  it("kontak terdaftar dan cocok → diterima", () => {
    expect(verifikasiHp("081234567890", "081234567890", false)).toEqual({
      cocok: true,
      alasan: "terdaftar",
    });
  });

  it("kontak terdaftar tapi BEDA → ditolak", () => {
    // Inti butir 3.4: orang lain yang tahu No. Pelanggan korban tidak bisa
    // lagi mengajukan atas nama mereka.
    const r = verifikasiHp("081234567890", "089999999999", false);
    expect(r.cocok).toBe(false);
  });

  it("beda bentuk penulisan tetap dianggap cocok", () => {
    expect(verifikasiHp("+62 812-3456-7890", "081234567890", false).cocok).toBe(true);
  });
});

describe("verifikasiHp — mode ketat", () => {
  it("belum ada kontak → ditolak", () => {
    expect(verifikasiHp(null, "081234567890", true).cocok).toBe(false);
  });

  it("pesan 'belum terdaftar' TIDAK dibedakan dari 'tidak cocok'", () => {
    // Kalau dibedakan, halaman ini jadi alat memetakan No. Pelanggan mana yang
    // sudah punya kontak di database PDAM dan mana yang belum.
    const belumAda = verifikasiHp(null, "081234567890", true);
    const tidakCocok = verifikasiHp("081234567890", "089999999999", true);
    expect(belumAda.cocok).toBe(false);
    expect(tidakCocok.cocok).toBe(false);
    expect(!belumAda.cocok && belumAda.error).toBe(!tidakCocok.cocok && tidakCocok.error);
  });

  it("kontak terdaftar dan cocok tetap diterima", () => {
    expect(verifikasiHp("081234567890", "081234567890", true).cocok).toBe(true);
  });
});
