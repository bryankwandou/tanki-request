"use server";

import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth/roles";
import { setConfig, type ConfigKey } from "@/lib/tanki/config";
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

  const entries: Partial<Record<ConfigKey, string>> = {
    smtp_host: str("smtp_host"),
    smtp_port: str("smtp_port") || "587",
    smtp_secure: bool("smtp_secure"),
    smtp_user: str("smtp_user"),
    smtp_from: str("smtp_from"),
    otp_enabled: bool("otp_enabled"),
    otp_ttl_minutes: str("otp_ttl_minutes") || "5",
    otp_length: str("otp_length") || "6",
    rate_limit_per_hour: str("rate_limit_per_hour") || "3",
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
