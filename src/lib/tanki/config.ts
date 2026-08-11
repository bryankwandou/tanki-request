import { db } from "@/lib/db";

export {
  CONFIG_DEFAULTS,
  NUMERIC_BOUNDS,
  SECRET_KEYS,
  configNumber,
  renderTemplate,
  type ConfigKey,
} from "@/lib/tanki/config-schema";

import { CONFIG_DEFAULTS, SECRET_KEYS, type ConfigKey } from "@/lib/tanki/config-schema";
import { decryptSecret, encryptSecret } from "@/lib/tanki/secret";

const isSecret = (k: ConfigKey) => SECRET_KEYS.includes(k);

/** Isi tabel apa adanya — nilai rahasia masih dalam bentuk ciphertext. */
async function readRawConfig(): Promise<Record<ConfigKey, string>> {
  const rows = await db.konfigurasi.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = { ...CONFIG_DEFAULTS } as Record<ConfigKey, string>;
  for (const k of Object.keys(CONFIG_DEFAULTS) as ConfigKey[]) {
    if (map[k] !== undefined) out[k] = map[k];
  }
  return out;
}

/**
 * Konfigurasi untuk pemakaian umum (template email, angka OTP, halaman admin).
 *
 * Nilai rahasia SELALU dikosongkan di sini. getConfig() dipanggil dari Server
 * Component dan hasilnya gampang ikut terserialisasi ke payload RSC; dengan
 * masking di satu tempat ini, tidak ada pemanggil yang bisa membocorkannya
 * karena lupa. Yang butuh nilai aslinya hanya getSmtpConfig().
 */
export async function getConfig(): Promise<Record<ConfigKey, string>> {
  const out = await readRawConfig();
  for (const k of SECRET_KEYS) out[k] = "";
  return out;
}

/** Apakah sebuah rahasia sudah pernah diisi — tanpa mengungkap nilainya. */
export async function hasStoredSecret(key: ConfigKey): Promise<boolean> {
  const row = await db.konfigurasi.findUnique({ where: { key } });
  return Boolean(row?.value);
}

export async function setConfig(
  entries: Partial<Record<ConfigKey, string>>,
  updatedBy?: string | null,
) {
  const keys = Object.keys(entries) as ConfigKey[];
  // Enkripsi dilakukan SEBELUM transaksi: bila kunci tidak tersedia, panggilan
  // ini melempar dan tidak ada satu pun baris yang tersimpan setengah jalan.
  const values = Object.fromEntries(
    keys.map((key) => {
      const raw = entries[key] ?? "";
      return [key, isSecret(key) ? encryptSecret(raw) : raw];
    }),
  ) as Record<ConfigKey, string>;

  await db.$transaction(
    keys.map((key) =>
      db.konfigurasi.upsert({
        where: { key },
        create: { key, value: values[key], updatedBy: updatedBy ?? null },
        update: { value: values[key], updatedBy: updatedBy ?? null },
      }),
    ),
  );
}

/**
 * Baca satu nilai rahasia dalam bentuk aslinya.
 *
 * getConfig() selalu mengosongkan kolom rahasia karena hasilnya gampang ikut
 * terserialisasi ke payload RSC. Fungsi ini jalan keluarnya untuk pemanggil
 * sisi-server yang memang butuh nilainya (mis. token gateway WA/SMS).
 *
 * Dekripsi yang gagal mengembalikan null — diperlakukan sama seperti "belum
 * diisi", bukan string kosong yang menutupi masalah kunci enkripsi.
 */
export async function getSecretConfig(key: ConfigKey): Promise<string | null> {
  if (!isSecret(key)) {
    throw new Error(`getSecretConfig dipanggil untuk kunci non-rahasia: ${key}`);
  }
  const c = await readRawConfig();
  if (!c[key]) return null;
  const plain = decryptSecret(c[key]);
  if (plain === null) {
    console.error(
      `[KONFIGURASI] Nilai rahasia "${key}" gagal didekripsi — periksa CONFIG_ENCRYPTION_KEY.`,
    );
    return null;
  }
  return plain || null;
}

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

/**
 * Satu-satunya tempat password SMTP didekripsi.
 *
 * Dekripsi yang gagal (kunci hilang atau berganti, baris diubah orang) TIDAK
 * dianggap "password kosong" — itu akan membuat aplikasi mencoba mengirim tanpa
 * autentikasi dan menutupi masalah sebenarnya. Kembalikan null saja, sehingga
 * pemanggil memperlakukannya sama seperti SMTP yang belum dikonfigurasi.
 */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const c = await readRawConfig();
  if (!c.smtp_host) return null;

  let pass: string | undefined;
  if (c.smtp_pass) {
    const plain = decryptSecret(c.smtp_pass);
    if (plain === null) {
      console.error(
        "[KONFIGURASI] Password SMTP gagal didekripsi — periksa CONFIG_ENCRYPTION_KEY. " +
          "Pengiriman email dinonaktifkan sampai ini dibereskan.",
      );
      return null;
    }
    pass = plain || undefined;
  }

  return {
    host: c.smtp_host,
    port: Number(c.smtp_port) || 587,
    secure: c.smtp_secure === "true",
    user: c.smtp_user || undefined,
    pass,
    from: c.smtp_from || "noreply@pdam-makassar.go.id",
  };
}
