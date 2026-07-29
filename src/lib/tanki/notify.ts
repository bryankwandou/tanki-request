import { db } from "@/lib/db";
import { CONFIG_DEFAULTS, getConfig, getSmtpConfig, renderTemplate, type ConfigKey } from "@/lib/tanki/config";
import type { NotifJenis } from "@/generated/prisma/client";
import {
  NO_SMTP_ERROR,
  maskRecipient,
  readDeliveryEnv,
  resolveDelivery,
  shouldLogBody,
} from "@/lib/tanki/notify-policy";
import { trackingUrl } from "@/lib/tanki/tracking-link";
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
  // Dicatat terpisah dari `ok`: jalur console "berhasil" secara teknis, tapi
  // tidak ada email yang benar-benar keluar. Lihat statusKirim di bawah.
  let dilewati = false;
  try {
    const smtp = await getSmtpConfig();
    const env = readDeliveryEnv(Boolean(smtp));

    switch (resolveDelivery(env)) {
      case "smtp": {
        const transport = nodemailer.createTransport({
          host: smtp!.host,
          port: smtp!.port,
          secure: smtp!.secure,
          auth: smtp!.user ? { user: smtp!.user, pass: smtp!.pass } : undefined,
        });
        await transport.sendMail({ from: smtp!.from, to, subject, text: body });
        break;
      }
      case "console": {
        // Development saja. Isi email hanya ikut tercetak bila boleh — kode OTP
        // tidak pernah ikut kecuali OTP_DEBUG_LOG=1 diset sadar-sadar.
        //
        // SUBJECT ikut ditahan untuk OTP, bukan hanya body. Template subjek
        // bawaan boleh diubah admin dan bisa saja memuat {{kode}}; menahan body
        // saja persis jebakan yang diperingatkan reviewer di Issue #7 — kodenya
        // tetap bocor utuh lewat subjek.
        const boleh = shouldLogBody(jenis, env);
        const detail = boleh
          ? `${subject}\n${body}`
          : `(subjek & isi tidak dicetak — baca di Mailpit http://localhost:8025)`;
        console.log(
          `\n[EMAIL→${maskRecipient(to)}] (${jenis}) ${detail}\n` +
            `(SMTP belum dikonfigurasi — set di /dashboard/konfigurasi)\n----------------------------`,
        );
        dilewati = true;
        break;
      }
      case "fail":
        // Produksi tanpa SMTP: gagal terang-terangan. Kegagalannya tercatat di
        // notifikasi_log di bawah, jadi admin punya jejak untuk ditindaklanjuti.
        throw new Error(NO_SMTP_ERROR);
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
        // DILEWATI, bukan TERKIRIM: tidak ada email yang benar-benar keluar
        // lewat jalur console. Log audit FR-20/21 harus jujur soal ini.
        statusKirim: !ok ? "GAGAL" : dilewati ? "DILEWATI" : "TERKIRIM",
        error,
      },
    });
  } catch {
    // jangan gagalkan alur utama hanya karena logging gagal
  }

  return { ok, skipped: false as const, error };
}


/**
 * Tautan lacak untuk email (Issue #6). Kegagalan menandatangani — praktisnya
 * hanya terjadi bila AUTH_SECRET/TRACKING_LINK_SECRET tidak diset — tidak boleh
 * menggagalkan pengiriman email tiketnya; pelapor masih bisa melacak manual.
 */
function safeTrackingUrl(noTiket: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.AUTH_URL?.trim();
  if (!base) return "";
  try {
    return trackingUrl(noTiket, base);
  } catch {
    console.warn("[NOTIFIKASI] Tautan lacak tidak bisa dibuat — periksa TRACKING_LINK_SECRET/AUTH_SECRET.");
    return "";
  }
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
  const vars = { no_tiket: t.noTiket, tracking_url: safeTrackingUrl(t.noTiket) };
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
