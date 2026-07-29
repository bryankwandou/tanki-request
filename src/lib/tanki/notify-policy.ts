/**
 * Kebijakan pengiriman & logging email (Issue #7) — murni, tanpa DB/SMTP,
 * supaya bisa diuji langsung.
 */
import type { NotifJenis } from "@/generated/prisma/client";

export type Delivery = "smtp" | "console" | "fail";

export type DeliveryEnv = {
  hasSmtp: boolean;
  isProduction: boolean;
  /** OTP_DEBUG_LOG=1 — opt-in eksplisit, hanya berlaku di luar produksi. */
  otpDebugLog: boolean;
};

/**
 * Sebelumnya, SMTP yang belum dikonfigurasi berarti "cetak isi email ke stdout
 * lalu laporkan sukses". Di produksi itu dua kesalahan sekaligus: kode OTP
 * hidup masuk log container, dan kegagalan kirim tersamar sebagai keberhasilan.
 *
 * Aplikasi ini default-nya smtp_host kosong, jadi deployment baru yang belum
 * diisi admin persis jatuh ke jalur itu.
 */
export function resolveDelivery(env: DeliveryEnv): Delivery {
  if (env.hasSmtp) return "smtp";
  return env.isProduction ? "fail" : "console";
}

/**
 * Isi email hanya boleh dicetak untuk jenis non-OTP, di luar produksi.
 * Untuk OTP dibutuhkan opt-in eksplisit — repo ini sudah menyediakan Mailpit di
 * docker-compose, jadi jalan normal untuk membaca kode saat development adalah
 * membuka http://localhost:8025, bukan membaca stdout.
 */
export function shouldLogBody(jenis: NotifJenis, env: DeliveryEnv): boolean {
  if (env.isProduction) return false;
  if (jenis === "OTP") return env.otpDebugLog;
  return true;
}

/** Samarkan alamat email untuk keperluan log. */
export function maskRecipient(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const user = email.slice(0, at);
  const domain = email.slice(at);
  const head = user.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, user.length - head.length))}${domain}`;
}

export const NO_SMTP_ERROR =
  "SMTP belum dikonfigurasi. Isi pengaturan SMTP di /dashboard/konfigurasi " +
  "sebelum sistem bisa mengirim email.";

export function readDeliveryEnv(hasSmtp: boolean): DeliveryEnv {
  return {
    hasSmtp,
    isProduction: process.env.NODE_ENV === "production",
    otpDebugLog: process.env.OTP_DEBUG_LOG === "1",
  };
}
