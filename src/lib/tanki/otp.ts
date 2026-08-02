import crypto from "node:crypto";
import { db } from "@/lib/db";
import { getConfig } from "@/lib/tanki/config";
import { notifyOtp } from "@/lib/tanki/notify";
import {
  evaluateResendGate,
  MAX_ATTEMPTS,
  THROTTLE,
  TOO_MANY,
  VERIFY_FAILED,
} from "@/lib/tanki/otp-policy";
import { rateLimit } from "@/lib/tanki/rate-limit";
import { ACTIVE_STATUSES } from "@/lib/tanki/status";
import { createTiket } from "@/lib/tanki/tiket";

function genCode(len: number): string {
  let c = "";
  for (let i = 0; i < len; i++) c += crypto.randomInt(0, 10).toString();
  return c;
}
const hash = (code: string) => crypto.createHash("sha256").update(code).digest("hex");

/**
 * Identitas permintaan OTP yang dipegang klien.
 *
 * Row id bersifat sequential, jadi memakainya sebagai `otpId` publik berarti
 * penyerang dapat menghitung id milik orang lain dan menyerang permintaan yang
 * bukan miliknya — termasuk menghabiskan cap percobaan korban. 32 byte acak
 * menutup itu. Lihat Issue #4.
 */
const genToken = () => crypto.randomBytes(32).toString("base64url");

/** Bentuk token yang sah — dipakai untuk menolak input sampah sebelum query. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  if (!d) return email;
  const head = u.length <= 2 ? u.slice(0, 1) : u.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, u.length - head.length))}@${d}`;
}

type PendingInput = { noPelanggan: string; noHp: string; email: string; keluhan: string };
export type PendingResult =
  | { ok: true; otpId: string; emailMasked: string; ttl: number }
  | { ok: false; error: string };

export async function createPendingRequest(input: PendingInput): Promise<PendingResult> {
  const pelanggan = await db.pelanggan.findUnique({ where: { nosamb: input.noPelanggan } });
  if (!pelanggan) return { ok: false, error: "Nomor Pelanggan tidak ditemukan pada data PDAM." };

  const aktif = await db.tiket.findFirst({
    where: { noPelanggan: input.noPelanggan, status: { in: [...ACTIVE_STATUSES] } },
  });
  if (aktif)
    return { ok: false, error: `Masih ada permintaan aktif (${aktif.noTiket}). Mohon tunggu hingga selesai.` };

  const cfg = await getConfig();
  const length = Number(cfg.otp_length) || 6;
  const ttl = Number(cfg.otp_ttl_minutes) || 10;
  const code = genCode(length);

  // Hanya satu OTP aktif per pelanggan.
  await db.otpVerifikasi.updateMany({
    where: { noPelanggan: input.noPelanggan, status: "PENDING" },
    data: { status: "EXPIRED" },
  });

  const row = await db.otpVerifikasi.create({
    data: {
      token: genToken(),
      noPelanggan: input.noPelanggan,
      email: input.email,
      noHp: input.noHp,
      keluhan: input.keluhan,
      kodeHash: hash(code),
      expiredAt: new Date(Date.now() + ttl * 60_000),
      status: "PENDING",
    },
  });

  await notifyOtp(input.email, code, ttl);
  return { ok: true, otpId: row.token, emailMasked: maskEmail(input.email), ttl };
}

export type VerifyResult = { ok: true; noTiket: string } | { ok: false; error: string };

export async function verifyPendingOtp(
  otpId: string,
  code: string,
  clientIp = "unknown",
): Promise<VerifyResult> {
  if (!TOKEN_RE.test(otpId)) return { ok: false, error: VERIFY_FAILED };

  // Throttle per-IP dan per-otpId dijalankan SEBELUM query, supaya membanjiri
  // endpoint dengan token acak pun tetap terbatas dan tidak membebani database.
  const byIp = await rateLimit(`otp:verify:ip:${clientIp}`, THROTTLE.verifyIp.max, THROTTLE.verifyIp.windowMs);
  if (!byIp.allowed) return { ok: false, error: TOO_MANY };

  const byId = await rateLimit(`otp:verify:id:${otpId}`, THROTTLE.verifyId.max, THROTTLE.verifyId.windowMs);
  if (!byId.allowed) return { ok: false, error: TOO_MANY };

  const row = await db.otpVerifikasi.findUnique({ where: { token: otpId } });
  if (!row || row.status !== "PENDING")
    return { ok: false, error: VERIFY_FAILED };
  const id = row.id;

  const byEmail = await rateLimit(
    `otp:verify:email:${row.email.toLowerCase()}`,
    THROTTLE.verifyEmail.max,
    THROTTLE.verifyEmail.windowMs,
  );
  if (!byEmail.allowed) return { ok: false, error: TOO_MANY };
  if (row.expiredAt < new Date()) {
    await db.otpVerifikasi.update({ where: { id }, data: { status: "EXPIRED" } });
    return { ok: false, error: VERIFY_FAILED };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await db.otpVerifikasi.update({ where: { id }, data: { status: "EXPIRED" } });
    return { ok: false, error: VERIFY_FAILED };
  }
  if (hash(code.trim()) !== row.kodeHash) {
    await db.otpVerifikasi.update({ where: { id }, data: { attempts: row.attempts + 1 } });
    return { ok: false, error: VERIFY_FAILED };
  }

  // Kode benar → baru sekarang laporan/tiket dibuat (email terverifikasi).
  const res = await createTiket({
    noPelanggan: row.noPelanggan,
    noHp: row.noHp,
    email: row.email,
    keluhan: row.keluhan ?? "",
  });
  if (!res.ok) return { ok: false, error: res.error };

  await db.otpVerifikasi.update({ where: { id }, data: { status: "VERIFIED" } });
  return { ok: true, noTiket: res.noTiket };
}

export async function resendPendingOtp(
  otpId: string,
  clientIp = "unknown",
): Promise<{ ok: boolean; error?: string }> {
  if (!TOKEN_RE.test(otpId)) return { ok: false, error: VERIFY_FAILED };

  const byIp = await rateLimit(`otp:resend:ip:${clientIp}`, THROTTLE.resendIp.max, THROTTLE.resendIp.windowMs);
  if (!byIp.allowed) return { ok: false, error: TOO_MANY };

  const byId = await rateLimit(`otp:resend:id:${otpId}`, THROTTLE.resendId.max, THROTTLE.resendId.windowMs);
  if (!byId.allowed) return { ok: false, error: TOO_MANY };

  const row = await db.otpVerifikasi.findUnique({ where: { token: otpId } });
  if (!row || row.status !== "PENDING")
    return { ok: false, error: VERIFY_FAILED };
  const id = row.id;

  const byEmail = await rateLimit(
    `otp:resend:email:${row.email.toLowerCase()}`,
    THROTTLE.resendEmail.max,
    THROTTLE.resendEmail.windowMs,
  );
  if (!byEmail.allowed) return { ok: false, error: TOO_MANY };

  const gate = evaluateResendGate(row);
  if (!gate.allow) {
    if (gate.expire) {
      await db.otpVerifikasi.update({ where: { id }, data: { status: "EXPIRED" } });
    }
    return { ok: false, error: gate.error };
  }

  const cfg = await getConfig();
  const length = Number(cfg.otp_length) || 6;
  const ttl = Number(cfg.otp_ttl_minutes) || 10;
  const code = genCode(length);

  // `attempts` SENGAJA tidak di-reset di sini — inilah inti perbaikan Issue #4.
  await db.otpVerifikasi.update({
    where: { id },
    data: {
      kodeHash: hash(code),
      expiredAt: new Date(Date.now() + ttl * 60_000),
      resendCount: { increment: 1 },
      lastSentAt: new Date(),
    },
  });
  await notifyOtp(row.email, code, ttl);
  return { ok: true };
}
