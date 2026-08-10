import crypto from "node:crypto";
import { db } from "@/lib/db";
import { configNumber, getConfig } from "@/lib/tanki/config";
import { notifyOtp } from "@/lib/tanki/notify";
import {
  DEFAULT_RESEND_LIMITS,
  evaluateResendGate,
  THROTTLE,
  TOO_MANY,
  VERIFY_FAILED,
} from "@/lib/tanki/otp-policy";
import { evaluateCooldown } from "@/lib/tanki/pengajuan-guard";
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

/**
 * Secret sesi OTP — lapis kedua di atas `token` (Issue #4).
 *
 * `token` adalah capability token yang ikut di form, jadi ia bisa bocor lewat
 * jalur yang tidak dikuasai aplikasi: Referer, log reverse proxy, riwayat
 * peramban, layar yang terlihat orang lain. Secret ini hanya hidup di cookie
 * HttpOnly — tidak terbaca JavaScript, tidak pernah ikut di URL — dan hanya
 * hash-nya yang tersimpan di database.
 *
 * Konsekuensinya: memegang `token` saja tidak lagi cukup untuk menebak kode,
 * meminta kirim ulang, atau menghabiskan jatah percobaan orang lain.
 */
export const genSessionSecret = () => crypto.randomBytes(32).toString("base64url");
const hashSecret = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/**
 * Bandingkan hash dengan waktu tetap. Panjangnya sudah pasti sama (SHA-256 hex),
 * tapi `===` pada string tetap keluar lebih cepat saat byte pertama berbeda.
 */
function secretCocok(sessionHash: string | null, secret: string | undefined): boolean {
  // Baris yang dibuat sebelum kolom ini ada tidak punya hash — pemiliknya tetap
  // harus bisa menyelesaikan permintaannya. Baris baru selalu mengisinya.
  if (!sessionHash) return true;
  if (!secret) return false;
  const a = Buffer.from(hashSecret(secret));
  const b = Buffer.from(sessionHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type PendingInput = { noPelanggan: string; noHp: string; email: string; keluhan: string };
export type PendingResult =
  | { ok: true; otpId: string; sessionSecret: string; emailMasked: string; ttl: number }
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

  // Cooldown antar pengajuan (butir 3.4). createTiket() memeriksanya lagi —
  // itu tempat penegakan yang sebenarnya, karena ia juga melindungi jalur
  // non-OTP. Pemeriksaan di sini murni supaya pengguna tahu SEBELUM kami
  // mengirimi mereka email kode yang pada akhirnya tidak bisa dipakai.
  const terakhir = await db.tiket.findFirst({
    where: { noPelanggan: input.noPelanggan },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const cooldown = evaluateCooldown(
    terakhir?.createdAt ?? null,
    Date.now(),
    configNumber(cfg, "submit_cooldown_hours"),
  );
  if (!cooldown.allow) return { ok: false, error: cooldown.error };

  const length = configNumber(cfg, "otp_length");
  const ttl = configNumber(cfg, "otp_ttl_minutes");
  const code = genCode(length);

  // Hanya satu OTP aktif per pelanggan.
  await db.otpVerifikasi.updateMany({
    where: { noPelanggan: input.noPelanggan, status: "PENDING" },
    data: { status: "EXPIRED" },
  });

  const sessionSecret = genSessionSecret();
  const row = await db.otpVerifikasi.create({
    data: {
      token: genToken(),
      sessionHash: hashSecret(sessionSecret),
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
  return {
    ok: true,
    otpId: row.token,
    // Dikembalikan ke server action, yang memasangnya sebagai cookie HttpOnly.
    // Tidak pernah sampai ke komponen klien.
    sessionSecret,
    emailMasked: maskEmail(input.email),
    ttl,
  };
}

export type VerifyResult = { ok: true; noTiket: string } | { ok: false; error: string };

export async function verifyPendingOtp(
  otpId: string,
  code: string,
  clientIp = "unknown",
  sessionSecret?: string,
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

  // Lapis kedua: cookie HttpOnly. Sengaja TIDAK menaikkan `attempts` dan tidak
  // meng-EXPIRED-kan baris — kalau iya, siapa pun yang memegang token bocor
  // tetap bisa menghabiskan jatah korban tanpa pernah menebak kode. Pesannya
  // pun sama dengan kegagalan lain supaya tidak jadi oracle "token ini hidup".
  if (!secretCocok(row.sessionHash, sessionSecret))
    return { ok: false, error: VERIFY_FAILED };

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

  // FR-30 — batas percobaan diatur admin, di-clamp 3–10 di sisi server.
  const maxAttempts = configNumber(await getConfig(), "otp_max_attempts");

  if (row.attempts >= maxAttempts) {
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
  sessionSecret?: string,
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

  // Lapis kedua: cookie HttpOnly. Ini yang menutup sisa primitif email bombing
  // pada Issue #4 — token yang bocor tidak lagi cukup untuk memicu pengiriman
  // email ke alamat pelanggan, maupun mengganti kode yang sudah mereka terima.
  if (!secretCocok(row.sessionHash, sessionSecret))
    return { ok: false, error: VERIFY_FAILED };

  const byEmail = await rateLimit(
    `otp:resend:email:${row.email.toLowerCase()}`,
    THROTTLE.resendEmail.max,
    THROTTLE.resendEmail.windowMs,
  );
  if (!byEmail.allowed) return { ok: false, error: TOO_MANY };

  const gate = evaluateResendGate(row, Date.now(), {
    ...DEFAULT_RESEND_LIMITS,
    maxAttempts: configNumber(await getConfig(), "otp_max_attempts"),
  });
  if (!gate.allow) {
    if (gate.expire) {
      await db.otpVerifikasi.update({ where: { id }, data: { status: "EXPIRED" } });
    }
    return { ok: false, error: gate.error };
  }

  const cfg = await getConfig();
  const length = configNumber(cfg, "otp_length");
  const ttl = configNumber(cfg, "otp_ttl_minutes");
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
