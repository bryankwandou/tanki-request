/**
 * Delay progresif setelah tebakan kode yang salah (butir 3.2 laporan review).
 *
 * Rate limiter yang sudah ada menutup serangan yang KERAS: 20 percobaan per IP
 * per 10 menit, 10 per email, 10 per permintaan. Yang tidak ia tutup adalah
 * serangan yang SABAR — penyerang yang menahan diri tepat di bawah ambang dan
 * membiarkan skripnya berjalan berhari-hari. Delay progresif membuat pola itu
 * mahal: setiap tebakan berikutnya dalam satu permintaan menunggu lebih lama,
 * sementara pengguna sah yang salah ketik sekali hampir tidak merasakannya.
 *
 * Angka-angkanya sengaja kecil di awal (0 ms untuk kesalahan pertama) supaya
 * warga yang jarinya keliru tidak dihukum, lalu naik cepat.
 *
 * Murni, tanpa I/O — supaya kurvanya bisa diuji tanpa menunggu waktu nyata.
 */

/** Batas atas. Menahan koneksi lebih lama dari ini justru jadi celah DoS sendiri. */
export const DELAY_MAKS_MS = 8_000;

/**
 * @param gagalSebelumnya Nilai kolom `attempts` SEBELUM tebakan ini dihitung.
 *   0 = ini kesalahan pertama pengguna.
 */
export function delayGagalMs(gagalSebelumnya: number): number {
  if (!Number.isFinite(gagalSebelumnya) || gagalSebelumnya <= 0) return 0;

  // 1 → 500ms, 2 → 1s, 3 → 2s, 4 → 4s, 5+ → 8s (dibatasi).
  const ms = 500 * 2 ** (gagalSebelumnya - 1);
  return Math.min(DELAY_MAKS_MS, ms);
}

/** Tidur non-blocking. Dipisah supaya uji bisa menggantinya. */
export function tidur(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}
