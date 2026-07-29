/**
 * Tautan lacak bertanda tangan, berumur pendek (Issue #6).
 *
 * Tanpa ini, satu-satunya jalan melacak adalah memasukkan No. Pelanggan + No. HP
 * — dua nilai yang gampang ditebak dan justru menjadi permukaan enumerasi yang
 * dikeluhkan issue. Tautan bertanda tangan memberi pelapor jalan masuk langsung
 * ke tiketnya sendiri tanpa perlu mengetik apa pun.
 *
 * Bentuk token: <payload base64url>.<hmac base64url>, payload = "<noTiket>|<exp>".
 * Tidak dienkripsi — isinya memang bukan rahasia. Yang dijaga adalah keasliannya:
 * tanda tangan HMAC membuat nomor tiket tidak bisa diganti orang, dan `exp`
 * membuat tautan yang bocor (mis. dari kotak email yang diteruskan) mati sendiri.
 */
import { createHmac, timingSafeEqual } from "crypto";

/** 14 hari — cukup untuk satu siklus permintaan sampai selesai, tidak abadi. */
export const TRACKING_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export class TrackingSecretMissingError extends Error {
  constructor() {
    super(
      "TRACKING_LINK_SECRET (atau AUTH_SECRET) belum diset — tautan lacak tidak bisa ditandatangani.",
    );
    this.name = "TrackingSecretMissingError";
  }
}

/**
 * AUTH_SECRET dipakai sebagai cadangan supaya fitur ini jalan tanpa menambah
 * satu variabel wajib lagi ke setiap deployment. Yang punya kunci sendiri boleh
 * memisahkannya lewat TRACKING_LINK_SECRET.
 */
function readSecret(): string | null {
  const s = process.env.TRACKING_LINK_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  return s ? s : null;
}

const b64url = (b: Buffer) => b.toString("base64url");

function sign(payload: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(payload).digest());
}

export function createTrackingToken(
  noTiket: string,
  now: Date = new Date(),
  ttlMs: number = TRACKING_LINK_TTL_MS,
): string {
  const secret = readSecret();
  if (!secret) throw new TrackingSecretMissingError();

  const payload = `${noTiket}|${now.getTime() + ttlMs}`;
  return `${b64url(Buffer.from(payload, "utf8"))}.${sign(payload, secret)}`;
}

export type TokenResult =
  | { ok: true; noTiket: string }
  | { ok: false; reason: "invalid" | "expired" };

/**
 * Verifikasi mengembalikan alasan yang dibedakan supaya halaman bisa berkata
 * "tautan sudah kedaluwarsa, silakan lacak manual" — pesan yang jauh lebih
 * berguna daripada "tidak ditemukan", dan tidak membocorkan apa pun: siapa pun
 * yang memegang token memang sudah memegang tautannya.
 */
export function verifyTrackingToken(
  token: string,
  now: Date = new Date(),
): TokenResult {
  const secret = readSecret();
  if (!secret) return { ok: false, reason: "invalid" };

  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "invalid" };

  const payload = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = Buffer.from(sign(payload, secret), "base64url");

  // Panjang harus dicek dulu: timingSafeEqual melempar bila berbeda panjang.
  if (given.length !== expected.length) return { ok: false, reason: "invalid" };
  if (!timingSafeEqual(given, expected)) return { ok: false, reason: "invalid" };

  const sep = payload.lastIndexOf("|");
  if (sep <= 0) return { ok: false, reason: "invalid" };

  const noTiket = payload.slice(0, sep);
  const exp = Number(payload.slice(sep + 1));
  if (!Number.isFinite(exp)) return { ok: false, reason: "invalid" };
  if (now.getTime() > exp) return { ok: false, reason: "expired" };

  return { ok: true, noTiket };
}

/** URL lengkap untuk disisipkan ke email. */
export function trackingUrl(noTiket: string, baseUrl: string, now?: Date): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/lacak?t=${encodeURIComponent(createTrackingToken(noTiket, now))}`;
}
