import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SecretKeyMissingError,
  decryptSecret,
  encryptSecret,
  isEncrypted,
  isEncryptionConfigured,
} from "./secret";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

describe("enkripsi rahasia konfigurasi (Issue #7)", () => {
  const asli = process.env.CONFIG_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.CONFIG_ENCRYPTION_KEY = KEY_A;
  });
  afterEach(() => {
    if (asli === undefined) delete process.env.CONFIG_ENCRYPTION_KEY;
    else process.env.CONFIG_ENCRYPTION_KEY = asli;
  });

  it("bolak-balik menghasilkan nilai yang sama", () => {
    const rahasia = "p4ssw0rd-smtp-pdam!";
    expect(decryptSecret(encryptSecret(rahasia))).toBe(rahasia);
  });

  it("ciphertext tidak memuat plaintext-nya", () => {
    const enc = encryptSecret("p4ssw0rd-smtp-pdam!");
    expect(enc).not.toContain("p4ssw0rd");
    expect(isEncrypted(enc)).toBe(true);
  });

  it("dua enkripsi nilai sama menghasilkan ciphertext berbeda (IV acak)", () => {
    expect(encryptSecret("sama")).not.toBe(encryptSecret("sama"));
  });

  it("nilai kosong tetap kosong, tidak jadi ciphertext", () => {
    expect(encryptSecret("")).toBe("");
    expect(decryptSecret("")).toBe("");
  });

  it("baris lama yang masih cleartext dikembalikan apa adanya", () => {
    // Tanpa ini, deploy perbaikan Issue #7 mematikan SMTP instalasi berjalan.
    expect(decryptSecret("password-lama-belum-terenkripsi")).toBe(
      "password-lama-belum-terenkripsi",
    );
  });

  it("ciphertext yang diubah ditolak, bukan menghasilkan sampah", () => {
    const enc = encryptSecret("rahasia");
    const parts = enc.split(":");
    const ct = Buffer.from(parts[4], "base64");
    ct[0] ^= 0xff;
    parts[4] = ct.toString("base64");
    expect(decryptSecret(parts.join(":"))).toBeNull();
  });

  it("kunci yang berbeda tidak bisa membuka", () => {
    const enc = encryptSecret("rahasia");
    process.env.CONFIG_ENCRYPTION_KEY = KEY_B;
    expect(decryptSecret(enc)).toBeNull();
  });

  it("tanpa kunci: menyimpan melempar, bukan diam-diam menulis cleartext", () => {
    delete process.env.CONFIG_ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret("rahasia")).toThrow(SecretKeyMissingError);
  });

  it("tanpa kunci: dekripsi gagal jujur, tidak mengembalikan ciphertext mentah", () => {
    const enc = encryptSecret("rahasia");
    delete process.env.CONFIG_ENCRYPTION_KEY;
    expect(decryptSecret(enc)).toBeNull();
  });

  it("kunci dengan panjang salah ditolak", () => {
    process.env.CONFIG_ENCRYPTION_KEY = Buffer.alloc(16, 9).toString("base64");
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret("rahasia")).toThrow(SecretKeyMissingError);
  });
});
