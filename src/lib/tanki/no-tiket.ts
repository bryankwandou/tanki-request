/**
 * Pembangkit nomor tiket `TJ-YYYYMMDD-XXXX`.
 *
 * Dipisah dari tiket.ts (yang mengimpor @/lib/db) supaya sifat statistik
 * sufiksnya bisa diuji tanpa database.
 */
import crypto from "node:crypto";

/** Jumlah kombinasi sufiks: empat karakter base36 penuh. */
export const RUANG_SUFIKS_TIKET = 36 ** 4; // 1.679.616

/** Pola nomor tiket yang sah — dipakai juga oleh validasi halaman /lacak. */
export const NO_TIKET_RE = /^TJ-\d{8}-[0-9A-Z]{4}$/;

const pad = (n: number) => n.toString().padStart(2, "0");

/**
 * Sufiksnya dulu `Math.random() * 1296` — base36 dari 1295 paling panjang dua
 * karakter ("ZZ"), jadi dua posisi pertama SELALU "00" dan hanya ada 1.296
 * nomor mungkin per tanggal. Seluruh nomor tiket satu hari bisa dihabiskan
 * seorang penyerang dalam hitungan menit, dan tabrakan nomor mulai sering
 * terjadi jauh sebelum layanan ramai (paradoks ulang tahun: ~42 tiket/hari
 * sudah memberi peluang tabrakan 50%).
 *
 * Sekarang keempat posisi dipakai penuh, dan diambil dari `crypto.randomInt`
 * bukan `Math.random()` yang tidak kriptografis dan bisa diprediksi dari
 * keluaran sebelumnya. Formatnya tidak berubah, jadi nomor lama tetap sah dan
 * tampilannya di email maupun UI tetap sama.
 */
export function genNoTiket(now: Date = new Date()): string {
  const ymd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const rand = crypto
    .randomInt(0, RUANG_SUFIKS_TIKET)
    .toString(36)
    .toUpperCase()
    .padStart(4, "0");
  return `TJ-${ymd}-${rand}`;
}
