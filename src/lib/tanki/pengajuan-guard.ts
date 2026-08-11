/**
 * Cooldown antar pengajuan untuk satu No. Pelanggan (butir 3.4 laporan review).
 *
 * Guard "masih ada permintaan aktif" di `createTiket` hanya menahan permintaan
 * kedua selama yang pertama BELUM selesai. Begitu tiket ditutup (SELESAI /
 * DITOLAK / DIBATALKAN), satu nomor pelanggan bisa langsung mengantre lagi
 * berkali-kali dalam sehari — persis pola spam yang dikeluhkan laporan.
 *
 * Rate limiter per jam yang sudah ada tidak menutup ini: ia hidup di Redis/LRU
 * dengan window satu jam dan hilang saat proses/Redis restart. Cooldown di sini
 * dihitung dari `created_at` tiket terakhir di database, jadi ia bertahan
 * melewati restart dan tidak bisa dilewati dengan menunggu window limiter habis.
 *
 * Modul ini sengaja murni (tanpa I/O) supaya keputusannya bisa diuji tanpa MySQL.
 */

/** Kunci konfigurasi admin; 0 = cooldown dimatikan. */
export const COOLDOWN_DIMATIKAN = 0;

export type CooldownResult =
  | { allow: true }
  | { allow: false; error: string; retryAfterMs: number };

/**
 * Bulatkan sisa waktu ke atas menjadi kalimat Indonesia yang bisa dibaca warga.
 * Dibulatkan ke atas supaya pengguna yang mencoba lagi tepat pada angka yang
 * ditampilkan tidak tertolak untuk kedua kalinya.
 */
export function formatSisaWaktu(ms: number): string {
  const menit = Math.ceil(ms / 60_000);
  if (menit < 60) return `${menit} menit`;
  const jam = Math.ceil(menit / 60);
  if (jam < 24) return `${jam} jam`;
  return `${Math.ceil(jam / 24)} hari`;
}

/**
 * @param terakhirDibuat `created_at` tiket terakhir pelanggan ini, atau null
 *   bila dia belum pernah mengajukan sama sekali.
 * @param jam Lama cooldown dari konfigurasi admin (sudah di-clamp pemanggil).
 */
export function evaluateCooldown(
  terakhirDibuat: Date | null,
  now: number,
  jam: number,
): CooldownResult {
  if (!terakhirDibuat) return { allow: true };
  if (!Number.isFinite(jam) || jam <= COOLDOWN_DIMATIKAN) return { allow: true };

  const berlaluMs = now - terakhirDibuat.getTime();
  // Tanggal di masa depan (jam server bergeser / data diedit manual) tidak boleh
  // mengunci pelanggan selamanya — perlakukan sebagai "sudah lewat".
  if (berlaluMs < 0) return { allow: true };

  const jendelaMs = jam * 60 * 60_000;
  if (berlaluMs >= jendelaMs) return { allow: true };

  const sisaMs = jendelaMs - berlaluMs;
  return {
    allow: false,
    retryAfterMs: sisaMs,
    error:
      `Nomor Pelanggan ini baru saja mengajukan permintaan. ` +
      `Silakan coba lagi dalam ${formatSisaWaktu(sisaMs)}.`,
  };
}
