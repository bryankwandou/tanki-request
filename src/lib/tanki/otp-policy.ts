// Kebijakan OTP — murni, tanpa I/O.
//
// Dipisah dari otp.ts supaya keputusan keamanannya bisa diuji tanpa database,
// tanpa SMTP, dan tanpa runtime Next. Semua nilai batas ada di satu tempat.

/**
 * Batas percobaan verifikasi GAGAL sepanjang umur satu permintaan.
 * Kolom `attempts` sengaja tidak pernah di-reset saat kirim ulang — reset itulah
 * yang membuat cap-nya bisa dilewati (Issue #4).
 * Dijadikan configurable pada Issue #3.
 */
export const MAX_ATTEMPTS = 5;

/** Batas kirim ulang per permintaan. Kode baru tidak mengembalikan jatah tebakan. */
export const MAX_RESENDS = 3;

/** Jeda minimal antar kirim ulang, menahan penggerukan kuota email. */
export const RESEND_COOLDOWN_MS = 60_000;

/**
 * Throttle verify/resend.
 *
 * Kunci per-`otpId` saja tidak cukup: `otpId` dikuasai penyerang sendiri, jadi
 * mereka tinggal submit permintaan baru untuk mendapat `otpId` segar dan cap-nya
 * ikut segar. Karena itu setiap operasi juga dibatasi per-IP dan per-email —
 * dua identitas yang tidak bisa mereka ganti sesuka hati.
 */
export const THROTTLE = {
  verifyIp: { max: 20, windowMs: 10 * 60_000 },
  verifyEmail: { max: 10, windowMs: 10 * 60_000 },
  resendIp: { max: 5, windowMs: 10 * 60_000 },
  resendEmail: { max: 3, windowMs: 10 * 60_000 },
} as const;

export const TOO_MANY = "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.";

export type ResendGate = { allow: true } | { allow: false; expire: boolean; error: string };

export type ResendLimits = {
  maxAttempts: number;
  maxResends: number;
  cooldownMs: number;
};

export const DEFAULT_RESEND_LIMITS: ResendLimits = {
  maxAttempts: MAX_ATTEMPTS,
  maxResends: MAX_RESENDS,
  cooldownMs: RESEND_COOLDOWN_MS,
};

/**
 * Keputusan boleh-tidaknya kirim ulang, murni dari state permintaan.
 *
 * Urutan pemeriksaan disengaja: cap tebakan lebih dulu, supaya penyerang yang
 * sudah menabrak cap tidak sekadar diberi tahu "tunggu sebentar" — permintaannya
 * langsung ditandai kedaluwarsa.
 */
export function evaluateResendGate(
  state: { attempts: number; resendCount: number; lastSentAt: Date },
  now: number = Date.now(),
  limits: ResendLimits = DEFAULT_RESEND_LIMITS,
): ResendGate {
  if (state.attempts >= limits.maxAttempts) {
    return {
      allow: false,
      expire: true,
      error: "Terlalu banyak percobaan. Silakan ajukan permintaan baru.",
    };
  }

  if (state.resendCount >= limits.maxResends) {
    return {
      allow: false,
      expire: false,
      error: "Batas kirim ulang tercapai. Silakan ajukan permintaan baru.",
    };
  }

  const sinceLast = now - state.lastSentAt.getTime();
  if (sinceLast < limits.cooldownMs) {
    const wait = Math.ceil((limits.cooldownMs - sinceLast) / 1000);
    return {
      allow: false,
      expire: false,
      error: `Mohon tunggu ${wait} detik sebelum meminta kode baru.`,
    };
  }

  return { allow: true };
}
