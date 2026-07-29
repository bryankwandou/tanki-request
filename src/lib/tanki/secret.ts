/**
 * Enkripsi nilai rahasia yang disimpan di tabel `konfigurasi` (Issue #7).
 *
 * Kuncinya HANYA dari environment (`CONFIG_ENCRYPTION_KEY`), tidak pernah ikut
 * masuk database. Ini yang membuat enkripsinya ada gunanya: seseorang yang
 * memegang dump `.sql` — dan di proyek ini dump rutin keluar-masuk container
 * untuk master `pelanggan` ~231k baris — tidak ikut mendapatkan kuncinya.
 *
 * AES-256-GCM dipilih karena authenticated: ciphertext yang diubah orang lain
 * ditolak saat dekripsi, bukan diam-diam menghasilkan sampah.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const PREFIX = "enc:v1:";
const IV_BYTES = 12; // ukuran nonce yang direkomendasikan untuk GCM
const KEY_BYTES = 32;

export class SecretKeyMissingError extends Error {
  constructor() {
    super(
      "CONFIG_ENCRYPTION_KEY belum diset. Password SMTP tidak bisa disimpan " +
        "terenkripsi. Buat kunci dengan: openssl rand -base64 32",
    );
    this.name = "SecretKeyMissingError";
  }
}

/**
 * Kunci dibaca per panggilan, bukan di-cache saat modul dimuat, supaya rotasi
 * kunci tidak menuntut restart dan supaya modul ini aman diimpor dari mana pun
 * (import tidak boleh melempar hanya karena env belum lengkap).
 */
function readKey(): Buffer | null {
  const raw = process.env.CONFIG_ENCRYPTION_KEY?.trim();
  if (!raw) return null;

  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    return null;
  }
  if (key.length !== KEY_BYTES) return null;
  return key;
}

export function isEncryptionConfigured(): boolean {
  return readKey() !== null;
}

/** Nilai yang sudah berbentuk ciphertext kita sendiri. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/**
 * Bungkus nilai menjadi `enc:v1:<iv>:<tag>:<ciphertext>` (semua base64).
 * Melempar SecretKeyMissingError bila kunci tidak tersedia — sengaja gagal
 * keras, karena menyimpan diam-diam dalam bentuk cleartext justru mengulang
 * bug yang sedang diperbaiki.
 */
export function encryptSecret(plaintext: string): string {
  if (plaintext === "") return "";
  const key = readKey();
  if (!key) throw new SecretKeyMissingError();

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/**
 * Kebalikan encryptSecret.
 *
 * Nilai yang tidak berawalan `enc:v1:` dikembalikan apa adanya: itu baris lama
 * dari sebelum Issue #7 yang masih cleartext. Tanpa jalur ini, deploy perbaikan
 * ini akan membuat SMTP milik instalasi yang sudah berjalan mendadak mati.
 * Baris seperti itu ikut ter-migrasi sendiri begitu admin menyimpan ulang.
 *
 * Mengembalikan null bila gagal (kunci hilang, kunci salah, ciphertext diubah)
 * — pemanggil memperlakukannya sebagai "SMTP tidak terkonfigurasi", bukan
 * mengirim dengan password sampah.
 */
export function decryptSecret(stored: string): string | null {
  if (stored === "") return "";
  if (!isEncrypted(stored)) return stored;

  const key = readKey();
  if (!key) return null;

  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return null;

  try {
    const [iv, tag, ct] = parts.map((p) => Buffer.from(p, "base64"));
    if (iv.length !== IV_BYTES) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    // Tag GCM tidak cocok → ciphertext diubah atau kunci berbeda.
    return null;
  }
}
