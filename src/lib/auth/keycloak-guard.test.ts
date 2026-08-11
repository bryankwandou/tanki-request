import { describe, expect, it } from "vitest";
import { PESAN_TANPA_SECRET, evaluasiKeycloak } from "./keycloak-guard";

const LENGKAP = {
  issuer: "https://diamond.pdammakassar.co.id/auth/realms/DIAMOND",
  clientId: "tanki-jene",
  clientSecret: "rahasia",
};

describe("gerbang Keycloak — produksi gagal terang-terangan (Issue #2)", () => {
  it("konfigurasi lengkap diizinkan", () => {
    expect(evaluasiKeycloak({ ...LENGKAP, isProduction: true })).toEqual({ boleh: true });
  });

  it("TANPA client secret di produksi → login dimatikan", () => {
    // Ketiadaan secret adalah tanda paling langsung bahwa client-nya masih
    // public: client confidential selalu punya secret.
    const r = evaluasiKeycloak({ ...LENGKAP, clientSecret: "", isProduction: true });
    expect(r.boleh).toBe(false);
    expect(!r.boleh && r.alasan).toBe(PESAN_TANPA_SECRET);
  });

  it("secret berisi spasi saja tetap dianggap kosong", () => {
    expect(evaluasiKeycloak({ ...LENGKAP, clientSecret: "   ", isProduction: true }).boleh).toBe(
      false,
    );
  });

  it("pesannya menyebutkan cara memperbaikinya, bukan sekadar 'gagal'", () => {
    expect(PESAN_TANPA_SECRET).toMatch(/keycloak_perbaiki_client\.mjs/);
    expect(PESAN_TANPA_SECRET).toMatch(/Issue #2/);
  });
});

describe("gerbang Keycloak — non-produksi tetap bisa dikembangkan", () => {
  it("tanpa secret: jalan, tapi dengan peringatan", () => {
    const r = evaluasiKeycloak({ ...LENGKAP, clientSecret: "", isProduction: false });
    expect(r.boleh).toBe(true);
    expect(r.boleh && r.peringatan).toBe(PESAN_TANPA_SECRET);
  });

  it("Keycloak belum dipasang sama sekali bukan 'tidak aman', hanya tidak ada", () => {
    // Menguji portal publik saja tidak perlu Keycloak.
    const r = evaluasiKeycloak({ isProduction: false });
    expect(r.boleh).toBe(true);
    expect(r.boleh && r.peringatan).toMatch(/belum dikonfigurasi/i);
  });

  it("di produksi, Keycloak yang belum dipasang tetap ditolak", () => {
    const r = evaluasiKeycloak({ isProduction: true });
    expect(r.boleh).toBe(false);
    expect(!r.boleh && r.alasan).toMatch(/belum dikonfigurasi/i);
  });
});
