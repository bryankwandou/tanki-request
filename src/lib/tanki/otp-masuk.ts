/**
 * Masuk tanpa harus mengajukan permintaan lebih dulu (butir 3.6).
 *
 * Sesi pelanggan sebelumnya hanya terbit sebagai efek samping verifikasi OTP
 * saat mengajukan tiket, sehingga warga yang sudah pernah dilayani tapi ingin
 * sekadar melihat riwayatnya tidak punya jalan masuk.
 *
 * Alur ini memakai infrastruktur OTP yang SAMA — tidak ada sistem akun, tidak
 * ada kata sandi. Bedanya satu: barisnya bertanda `tujuan = MASUK`, dan
 * verifikasinya hanya menerbitkan sesi baca-saja. Kode MASUK tidak akan pernah
 * bisa membuat tiket, dan kode TIKET tidak akan pernah bisa menerbitkan sesi.
 *
 * Syarat masuk: No. Pelanggan + email yang PERNAH dipakai pada permintaan
 * pelanggan itu. Bukan email bebas — kalau email bebas diterima, siapa pun yang
 * tahu No. Pelanggan orang lain tinggal memasukkan emailnya sendiri dan
 * membaca riwayat orang itu.
 */
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { AUDIT, catatAudit } from "@/lib/tanki/audit";
import { configNumber, getConfig } from "@/lib/tanki/config";
import { notifyOtp } from "@/lib/tanki/notify";
import { maskEmail } from "@/lib/tanki/otp";
import { THROTTLE, TOO_MANY, VERIFY_FAILED } from "@/lib/tanki/otp-policy";
import { delayGagalMs, tidur } from "@/lib/tanki/otp-delay";
import { rateLimit } from "@/lib/tanki/rate-limit";

const hash = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const genToken = () => crypto.randomBytes(32).toString("base64url");
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function genCode(len: number): string {
  let c = "";
  for (let i = 0; i < len; i++) c += crypto.randomInt(0, 10).toString();
  return c;
}

export const genSessionSecret = () => crypto.randomBytes(32).toString("base64url");

function secretCocok(sessionHash: string | null, secret: string | undefined): boolean {
  if (!sessionHash) return true;
  if (!secret) return false;
  const a = Buffer.from(hash(secret));
  const b = Buffer.from(sessionHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Satu pesan untuk SEMUA kegagalan permintaan kode masuk.
 *
 * Membedakan "No. Pelanggan tidak ada", "belum pernah mengajukan", dan "email
 * tidak cocok" akan mengubah halaman ini jadi alat memetakan nomor pelanggan
 * mana yang aktif dan email siapa yang terdaftar padanya.
 */
export const MASUK_GAGAL =
  "Bila data yang Anda masukkan cocok dengan permintaan yang pernah diajukan, " +
  "kami mengirim kode verifikasi ke email tersebut.";

export type MintaKodeResult =
  | { ok: true; otpId: string | null; sessionSecret: string | null; emailMasked: string | null; ttl: number }
  | { ok: false; error: string };

export async function mintaKodeMasuk(
  noPelanggan: string,
  email: string,
  clientIp = "unknown",
): Promise<MintaKodeResult> {
  const cfg = await getConfig();
  const ttl = configNumber(cfg, "otp_ttl_minutes");

  // Throttle sebelum menyentuh database: tanpa ini, halaman ini jadi alat
  // enumerasi No. Pelanggan yang murah, dan alat email bombing.
  const byIp = await rateLimit(
    `masuk:ip:${clientIp}`,
    THROTTLE.resendIp.max,
    THROTTLE.resendIp.windowMs,
  );
  if (!byIp.allowed) {
    await catatAudit({ jenis: AUDIT.OTP_THROTTLE, ip: clientIp, detail: "alur masuk" });
    return { ok: false, error: TOO_MANY };
  }
  const byEmail = await rateLimit(
    `masuk:email:${email.trim().toLowerCase()}`,
    THROTTLE.resendEmail.max,
    THROTTLE.resendEmail.windowMs,
  );
  if (!byEmail.allowed) return { ok: false, error: TOO_MANY };

  /**
   * Balasan SUKSES dikembalikan apa pun hasil pencocokan di bawah.
   *
   * Kalau kombinasi tidak cocok kita balas berbeda, halaman ini memberi tahu
   * penyerang apakah sebuah No. Pelanggan pernah memakai layanan dan email apa
   * yang terpaut padanya. Yang berbeda hanyalah: email benar-benar dikirim
   * atau tidak.
   */
  const cocok = await db.tiket.findFirst({
    where: {
      noPelanggan,
      email: { equals: email.trim() },
    },
    orderBy: { createdAt: "desc" },
    select: { noPelanggan: true, email: true },
  });

  if (!cocok?.email) {
    return { ok: true, otpId: null, sessionSecret: null, emailMasked: null, ttl };
  }

  // Satu kode masuk aktif per pelanggan.
  await db.otpVerifikasi.updateMany({
    where: { noPelanggan, tujuan: "MASUK", status: "PENDING" },
    data: { status: "EXPIRED" },
  });

  const code = genCode(configNumber(cfg, "otp_length"));
  const sessionSecret = genSessionSecret();
  const row = await db.otpVerifikasi.create({
    data: {
      token: genToken(),
      sessionHash: hash(sessionSecret),
      noPelanggan,
      email: cocok.email,
      // Kolom wajib pada tabel ini, tapi alur masuk tidak punya keluhan —
      // dan nilainya tidak pernah dibaca karena baris MASUK tidak membuat tiket.
      noHp: "",
      keluhan: "",
      kodeHash: hash(code),
      tujuan: "MASUK",
      expiredAt: new Date(Date.now() + ttl * 60_000),
      status: "PENDING",
    },
  });

  await notifyOtp(cocok.email, code, ttl);
  return {
    ok: true,
    otpId: row.token,
    sessionSecret,
    emailMasked: maskEmail(cocok.email),
    ttl,
  };
}

export type VerifikasiMasukResult =
  | { ok: true; noPelanggan: string }
  | { ok: false; error: string };

export async function verifikasiKodeMasuk(
  otpId: string,
  code: string,
  clientIp = "unknown",
  sessionSecret?: string,
): Promise<VerifikasiMasukResult> {
  if (!TOKEN_RE.test(otpId)) return { ok: false, error: VERIFY_FAILED };

  const byIp = await rateLimit(
    `masuk:verify:ip:${clientIp}`,
    THROTTLE.verifyIp.max,
    THROTTLE.verifyIp.windowMs,
  );
  if (!byIp.allowed) {
    await catatAudit({ jenis: AUDIT.OTP_THROTTLE, ip: clientIp, detail: "verifikasi masuk" });
    return { ok: false, error: TOO_MANY };
  }
  const byId = await rateLimit(
    `masuk:verify:id:${otpId}`,
    THROTTLE.verifyId.max,
    THROTTLE.verifyId.windowMs,
  );
  if (!byId.allowed) return { ok: false, error: TOO_MANY };

  const row = await db.otpVerifikasi.findUnique({ where: { token: otpId } });
  // Kode TIKET tidak boleh dipakai menerbitkan sesi.
  if (!row || row.status !== "PENDING" || row.tujuan !== "MASUK")
    return { ok: false, error: VERIFY_FAILED };

  if (!secretCocok(row.sessionHash, sessionSecret)) return { ok: false, error: VERIFY_FAILED };

  if (row.expiredAt < new Date()) {
    await db.otpVerifikasi.update({ where: { id: row.id }, data: { status: "EXPIRED" } });
    return { ok: false, error: VERIFY_FAILED };
  }

  const maks = configNumber(await getConfig(), "otp_max_attempts");
  if (row.attempts >= maks) {
    await db.otpVerifikasi.update({ where: { id: row.id }, data: { status: "EXPIRED" } });
    await catatAudit({ jenis: AUDIT.OTP_CAP_HABIS, subjek: row.email, ip: clientIp });
    return { ok: false, error: VERIFY_FAILED };
  }

  if (hash(code.trim()) !== row.kodeHash) {
    await db.otpVerifikasi.update({ where: { id: row.id }, data: { attempts: row.attempts + 1 } });
    await catatAudit({ jenis: AUDIT.OTP_KODE_SALAH, subjek: row.email, ip: clientIp });
    await tidur(delayGagalMs(row.attempts));
    return { ok: false, error: VERIFY_FAILED };
  }

  await db.otpVerifikasi.update({ where: { id: row.id }, data: { status: "VERIFIED" } });
  return { ok: true, noPelanggan: row.noPelanggan };
}
