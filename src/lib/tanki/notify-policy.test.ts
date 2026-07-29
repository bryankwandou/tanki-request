import { describe, expect, it } from "vitest";
import { maskRecipient, resolveDelivery, shouldLogBody } from "./notify-policy";

const env = (o: Partial<Parameters<typeof resolveDelivery>[0]>) => ({
  hasSmtp: false,
  isProduction: false,
  otpDebugLog: false,
  ...o,
});

describe("jalur pengiriman email (Issue #7)", () => {
  it("SMTP terkonfigurasi → kirim lewat SMTP", () => {
    expect(resolveDelivery(env({ hasSmtp: true }))).toBe("smtp");
    expect(resolveDelivery(env({ hasSmtp: true, isProduction: true }))).toBe("smtp");
  });

  it("produksi tanpa SMTP → gagal terang-terangan, bukan sukses palsu", () => {
    expect(resolveDelivery(env({ isProduction: true }))).toBe("fail");
  });

  it("development tanpa SMTP → boleh jatuh ke console", () => {
    expect(resolveDelivery(env({}))).toBe("console");
  });
});

describe("apa yang boleh masuk log", () => {
  it("kode OTP tidak pernah dicetak secara default", () => {
    expect(shouldLogBody("OTP", env({}))).toBe(false);
  });

  it("kode OTP hanya dicetak bila di-opt-in eksplisit di luar produksi", () => {
    expect(shouldLogBody("OTP", env({ otpDebugLog: true }))).toBe(true);
    expect(shouldLogBody("OTP", env({ otpDebugLog: true, isProduction: true }))).toBe(
      false,
    );
  });

  it("di produksi tidak ada isi email yang dicetak, jenis apa pun", () => {
    for (const j of ["OTP", "TIKET", "UPDATE"] as const) {
      expect(shouldLogBody(j, env({ isProduction: true }))).toBe(false);
    }
  });

  it("isi email non-OTP boleh dicetak saat development", () => {
    expect(shouldLogBody("UPDATE", env({}))).toBe(true);
  });
});

describe("penyamaran alamat penerima", () => {
  it("menyisakan dua huruf awal dan domain", () => {
    expect(maskRecipient("pelanggan@contoh.test")).toBe("pe*******@contoh.test");
  });

  it("alamat sangat pendek tetap tersamar", () => {
    expect(maskRecipient("a@b.test")).toBe("a*@b.test");
  });

  it("bukan alamat email tidak bocor apa pun", () => {
    expect(maskRecipient("bukan-email")).toBe("***");
  });
});
