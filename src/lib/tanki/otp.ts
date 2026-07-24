import crypto from "node:crypto";
import { db } from "@/lib/db";
import { getConfig } from "@/lib/tanki/config";
import { notifyOtp } from "@/lib/tanki/notify";
import { ACTIVE_STATUSES } from "@/lib/tanki/status";
import { createTiket } from "@/lib/tanki/tiket";

const MAX_ATTEMPTS = 5;

function genCode(len: number): string {
  let c = "";
  for (let i = 0; i < len; i++) c += crypto.randomInt(0, 10).toString();
  return c;
}
const hash = (code: string) => crypto.createHash("sha256").update(code).digest("hex");

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
  return { ok: true, otpId: row.id.toString(), emailMasked: maskEmail(input.email), ttl };
}

export type VerifyResult = { ok: true; noTiket: string } | { ok: false; error: string };

export async function verifyPendingOtp(otpId: string, code: string): Promise<VerifyResult> {
  let id: bigint;
  try {
    id = BigInt(otpId);
  } catch {
    return { ok: false, error: "Sesi verifikasi tidak valid." };
  }

  const row = await db.otpVerifikasi.findUnique({ where: { id } });
  if (!row || row.status !== "PENDING")
    return { ok: false, error: "Kode tidak ditemukan atau sudah dipakai. Silakan ajukan ulang." };
  if (row.expiredAt < new Date()) {
    await db.otpVerifikasi.update({ where: { id }, data: { status: "EXPIRED" } });
    return { ok: false, error: "Kode sudah kedaluwarsa. Minta kode baru." };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await db.otpVerifikasi.update({ where: { id }, data: { status: "EXPIRED" } });
    return { ok: false, error: "Terlalu banyak percobaan. Silakan ajukan ulang." };
  }
  if (hash(code.trim()) !== row.kodeHash) {
    await db.otpVerifikasi.update({ where: { id }, data: { attempts: row.attempts + 1 } });
    return { ok: false, error: `Kode salah. Sisa percobaan: ${MAX_ATTEMPTS - (row.attempts + 1)}.` };
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

export async function resendPendingOtp(otpId: string): Promise<{ ok: boolean; error?: string }> {
  let id: bigint;
  try {
    id = BigInt(otpId);
  } catch {
    return { ok: false, error: "Sesi verifikasi tidak valid." };
  }
  const row = await db.otpVerifikasi.findUnique({ where: { id } });
  if (!row || row.status !== "PENDING")
    return { ok: false, error: "Tidak ada permintaan menunggu. Silakan ajukan ulang." };

  const cfg = await getConfig();
  const length = Number(cfg.otp_length) || 6;
  const ttl = Number(cfg.otp_ttl_minutes) || 10;
  const code = genCode(length);
  await db.otpVerifikasi.update({
    where: { id },
    data: { kodeHash: hash(code), expiredAt: new Date(Date.now() + ttl * 60_000), attempts: 0 },
  });
  await notifyOtp(row.email, code, ttl);
  return { ok: true };
}
