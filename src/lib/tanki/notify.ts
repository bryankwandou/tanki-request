import { db } from "@/lib/db";
import { getSmtpConfig } from "@/lib/tanki/config";
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

export function notifyTiketCreated(t: {
  id: bigint;
  noTiket: string;
  email: string | null;
}) {
  return sendEmail({
    to: t.email,
    jenis: "TIKET",
    tiketId: t.id,
    subject: `Permintaan mobil tangki diterima — ${t.noTiket}`,
    body:
      `Permintaan Anda telah kami terima dengan nomor tiket ${t.noTiket}.\n` +
      `Pantau progres di portal Tanki Je'ne' dengan No. Pelanggan + No. HP Anda.`,
  });
}

export function notifyOtp(email: string, code: string, ttlMinutes: number) {
  return sendEmail({
    to: email,
    jenis: "OTP",
    subject: `Kode verifikasi permintaan Tanki Je'ne': ${code}`,
    body:
      `Kode verifikasi Anda: ${code}\n` +
      `Masukkan kode ini di halaman permintaan untuk mengonfirmasi laporan Anda.\n` +
      `Kode berlaku ${ttlMinutes} menit. Abaikan email ini bila Anda tidak mengajukan permintaan.`,
  });
}

export function notifyStatusChange(
  t: { id: bigint; noTiket: string; email: string | null },
  statusLabel: string,
  alasan?: string | null,
) {
  return sendEmail({
    to: t.email,
    jenis: "UPDATE",
    tiketId: t.id,
    subject: `Update permintaan ${t.noTiket}: ${statusLabel}`,
    body:
      `Status permintaan ${t.noTiket} kini: ${statusLabel}.` +
      (alasan ? `\nKeterangan: ${alasan}` : ""),
  });
}
