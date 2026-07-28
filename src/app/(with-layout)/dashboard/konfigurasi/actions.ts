"use server";

import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth/roles";
import {
  CONFIG_DEFAULTS,
  NUMERIC_BOUNDS,
  setConfig,
  type ConfigKey,
} from "@/lib/tanki/config";
import { sendEmail } from "@/lib/tanki/notify";
import { revalidatePath } from "next/cache";

export type ActionState = { ok: boolean; message?: string; error?: string };

export async function saveKonfigurasi(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!isAdmin(session)) return { ok: false, error: "Khusus admin." };

  const bool = (k: string) => (fd.get(k) ? "true" : "false");
  const str = (k: string) => String(fd.get(k) ?? "").trim();

  /**
   * Nilai numerik: kosong → default, di luar rentang → di-clamp.
   *
   * Fallback merujuk CONFIG_DEFAULTS, bukan literal yang diketik ulang. Sebelumnya
   * otp_ttl_minutes jatuh ke "5" di sini padahal default-nya "10", sehingga admin
   * yang mengosongkan field diam-diam memangkas masa berlaku OTP jadi separuhnya
   * — bukan mengembalikannya ke default seperti yang dia kira. Dengan merujuk
   * sumber yang sama, kelas bug ini tidak bisa terulang saat ada key baru.
   *
   * Clamp-nya di sini, bukan di atribut min/max input: ini server action, jadi
   * atribut HTML bukan kontrol keamanan.
   */
  const num = (k: ConfigKey) => {
    const raw = str(k);
    if (!raw) return CONFIG_DEFAULTS[k];
    const n = Number(raw);
    if (!Number.isFinite(n)) return CONFIG_DEFAULTS[k];
    const b = NUMERIC_BOUNDS[k];
    if (!b) return String(Math.floor(n));
    return String(Math.min(b.max, Math.max(b.min, Math.floor(n))));
  };

  /** Template kosong → kembalikan default, jangan biarkan email jadi kosong. */
  const tpl = (k: ConfigKey) => str(k) || CONFIG_DEFAULTS[k];

  const entries: Partial<Record<ConfigKey, string>> = {
    smtp_host: str("smtp_host"),
    smtp_port: num("smtp_port"),
    smtp_secure: bool("smtp_secure"),
    smtp_user: str("smtp_user"),
    smtp_from: str("smtp_from") || CONFIG_DEFAULTS.smtp_from,
    otp_enabled: bool("otp_enabled"),
    otp_ttl_minutes: num("otp_ttl_minutes"),
    otp_length: num("otp_length"),
    otp_max_attempts: num("otp_max_attempts"),
    rate_limit_per_hour: num("rate_limit_per_hour"),
    tpl_otp_subject: tpl("tpl_otp_subject"),
    tpl_otp_body: tpl("tpl_otp_body"),
    tpl_tiket_subject: tpl("tpl_tiket_subject"),
    tpl_tiket_body: tpl("tpl_tiket_body"),
    tpl_status_subject: tpl("tpl_status_subject"),
    tpl_status_body: tpl("tpl_status_body"),
  };
  // Password bersifat write-only: hanya update bila operator mengisi nilai baru.
  const pass = str("smtp_pass");
  if (pass) entries.smtp_pass = pass;

  await setConfig(entries, session?.user?.email);
  revalidatePath("/dashboard/konfigurasi");
  return { ok: true, message: "Konfigurasi tersimpan." };
}

export async function testSmtp(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!isAdmin(session)) return { ok: false, error: "Khusus admin." };

  const to = String(fd.get("testTo") ?? "").trim();
  if (!to) return { ok: false, error: "Isi alamat email tujuan tes." };

  const r = await sendEmail({
    to,
    jenis: "UPDATE",
    subject: "Tes SMTP — Tanki Je'ne'",
    body: "Ini email percobaan dari konfigurasi SMTP Tanki Je'ne'. Bila Anda menerimanya, konfigurasi sudah benar.",
  });

  return r.ok
    ? { ok: true, message: `Email tes terkirim ke ${to}.` }
    : { ok: false, error: r.error ?? "Gagal mengirim (cek konfigurasi SMTP)." };
}
