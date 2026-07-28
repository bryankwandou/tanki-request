import { db } from "@/lib/db";
import { CONFIG_DEFAULTS, getConfig, getSmtpConfig, renderTemplate, type ConfigKey } from "@/lib/tanki/config";
import type { NotifJenis } from "@/generated/prisma/client";
import nodemailer from "nodemailer";

type SendArgs = {
  to: string | null | undefined;
  subject: string;
  body: string;
  jenis: NotifJenis;
  tiketId?: bigint | null;
};

/**
 * Kirim email + catat ke notifikasi_log (FR-20/21).
 * Saat ini memakai transport "console" (log) agar berjalan tanpa SMTP.
 * Untuk produksi: ganti blok `transport` dengan nodemailer + env SMTP.
 */
export async function sendEmail({ to, subject, body, jenis, tiketId }: SendArgs) {
  if (!to) return { ok: false, skipped: true as const, error: "Tidak ada alamat email tujuan." };

  let ok = true;
  let error: string | null = null;
  try {
    const smtp = await getSmtpConfig();
    if (smtp) {
      // --- transport: SMTP (dikonfigurasi admin) ---
      const transport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      });
      await transport.sendMail({ from: smtp.from, to, subject, text: body });
    } else {
      // --- fallback: console (SMTP belum dikonfigurasi) ---
      console.log(
        `\n[EMAIL→${to}] (${jenis}) ${subject}\n${body}\n(SMTP belum dikonfigurasi — set di /dashboard/konfigurasi)\n----------------------------`,
      );
    }
  } catch (e) {
    ok = false;
    error = e instanceof Error ? e.message : String(e);
  }

  try {
    await db.notifikasiLog.create({
      data: {
        tiketId: tiketId ?? null,
        channel: "EMAIL",
        jenis,
        tujuan: to,
        statusKirim: ok ? "TERKIRIM" : "GAGAL",
        error,
      },
    });
  } catch {
    // jangan gagalkan alur utama hanya karena logging gagal
  }

  return { ok, skipped: false as const, error };
}

/** Ambil template dari konfigurasi admin; kosong / belum diisi → default bawaan. */
async function template(subjectKey: ConfigKey, bodyKey: ConfigKey) {
  const cfg = await getConfig();
  return {
    subject: cfg[subjectKey] || CONFIG_DEFAULTS[subjectKey],
    body: cfg[bodyKey] || CONFIG_DEFAULTS[bodyKey],
  };
}

export async function notifyTiketCreated(t: {
  id: bigint;
  noTiket: string;
  email: string | null;
}) {
  const { subject, body } = await template("tpl_tiket_subject", "tpl_tiket_body");
  const vars = { no_tiket: t.noTiket };
  return sendEmail({
    to: t.email,
    jenis: "TIKET",
    tiketId: t.id,
    subject: renderTemplate(subject, vars),
    body: renderTemplate(body, vars),
  });
}

export async function notifyOtp(email: string, code: string, ttlMinutes: number) {
  const { subject, body } = await template("tpl_otp_subject", "tpl_otp_body");
  const vars = { kode: code, ttl: String(ttlMinutes) };
  return sendEmail({
    to: email,
    jenis: "OTP",
    subject: renderTemplate(subject, vars),
    body: renderTemplate(body, vars),
  });
}

export async function notifyStatusChange(
  t: { id: bigint; noTiket: string; email: string | null },
  statusLabel: string,
  alasan?: string | null,
) {
  const { subject, body } = await template("tpl_status_subject", "tpl_status_body");
  const vars = {
    no_tiket: t.noTiket,
    status: statusLabel,
    alasan: alasan ? `\nKeterangan: ${alasan}` : "",
  };
  return sendEmail({
    to: t.email,
    jenis: "UPDATE",
    tiketId: t.id,
    subject: renderTemplate(subject, vars),
    body: renderTemplate(body, vars),
  });
}
