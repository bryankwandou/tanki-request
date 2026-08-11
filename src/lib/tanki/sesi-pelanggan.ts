/**
 * Sesi pelanggan opsional (butir 3.6 & 3.8 laporan review) — murni, tanpa I/O.
 *
 * Laporan meminta login opsional supaya pengguna tidak mengetik ulang No.
 * Pelanggan dan No. HP setiap kali, dan bisa melihat riwayat permintaannya.
 *
 * Yang SENGAJA tidak dibangun: sistem akun. Tidak ada tabel user, tidak ada
 * kata sandi, tidak ada reset password — semuanya permukaan serangan baru dan
 * beban operasional bagi PDAM, untuk kenyamanan yang bisa dicapai tanpa itu.
 *
 * Gantinya, sesi diterbitkan pada momen yang SUDAH membuktikan kepemilikan:
 * saat warga berhasil memasukkan kode OTP yang dikirim ke emailnya. Pada titik
 * itu mereka sudah membuktikan menguasai email tersebut — persis bukti yang
 * akan diminta oleh alur login mana pun yang kita bangun.
 *
 * Bentuknya cookie bertanda tangan HMAC, bukan penyimpanan sesi di database:
 * isinya hanya No. Pelanggan dan waktu kedaluwarsa, tidak ada yang perlu
 * dicabut satu per satu, dan tidak ada tabel baru yang harus dibersihkan.
 *
 * PENTING — sesi ini BUKAN kredensial operator. Ia hanya membuka data milik
 * pelapor sendiri (riwayat tiketnya) dan mengisi otomatis form. Ia tidak
 * pernah dipakai memberi hak apa pun di dashboard.
 */
import crypto from "node:crypto";

export const COOKIE_SESI_PELANGGAN = "tj_sesi_pelanggan";

/** 30 hari — cukup lama untuk terasa berguna, cukup pendek untuk perangkat bersama. */
export const UMUR_SESI_MS = 30 * 24 * 60 * 60_000;

export type IsiSesi = {
  /** No. Pelanggan yang kepemilikannya sudah dibuktikan lewat OTP. */
  nop: string;
  /** Epoch ms kedaluwarsa. */
  exp: number;
};

function kunci(secret: string | undefined): string {
  const s = secret ?? process.env.AUTH_SECRET ?? "";
  if (!s) throw new Error("AUTH_SECRET belum diset — sesi pelanggan tidak bisa ditandatangani.");
  return s;
}

function tandaTangan(payload: string, secret?: string): string {
  return crypto.createHmac("sha256", kunci(secret)).update(payload).digest("base64url");
}

export function buatSesi(nop: string, sekarang: number, secret?: string): string {
  const isi: IsiSesi = { nop, exp: sekarang + UMUR_SESI_MS };
  const payload = Buffer.from(JSON.stringify(isi)).toString("base64url");
  return `${payload}.${tandaTangan(payload, secret)}`;
}

export type HasilBaca =
  | { ok: true; nop: string }
  | { ok: false; alasan: "kosong" | "rusak" | "tanda-tangan" | "kedaluwarsa" };

export function bacaSesi(
  cookie: string | undefined | null,
  sekarang: number,
  secret?: string,
): HasilBaca {
  if (!cookie) return { ok: false, alasan: "kosong" };

  const pisah = cookie.lastIndexOf(".");
  if (pisah <= 0) return { ok: false, alasan: "rusak" };

  const payload = cookie.slice(0, pisah);
  const sig = cookie.slice(pisah + 1);

  /**
   * Tanda tangan diperiksa SEBELUM payload di-parse.
   *
   * Urutan ini yang membuat cookie tidak bisa dijadikan jalan masuk: JSON.parse
   * atas isi yang dikendalikan penyerang tidak pernah dijalankan sampai kita
   * yakin isinya kita sendiri yang menerbitkan.
   */
  const harusnya = tandaTangan(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(harusnya);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return { ok: false, alasan: "tanda-tangan" };

  let isi: IsiSesi;
  try {
    isi = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    return { ok: false, alasan: "rusak" };
  }

  if (typeof isi?.nop !== "string" || !/^\d{9}$/.test(isi.nop))
    return { ok: false, alasan: "rusak" };
  if (typeof isi?.exp !== "number" || !Number.isFinite(isi.exp))
    return { ok: false, alasan: "rusak" };

  // Kedaluwarsa ikut ditandatangani, jadi ia tidak bisa diperpanjang klien.
  if (sekarang >= isi.exp) return { ok: false, alasan: "kedaluwarsa" };

  return { ok: true, nop: isi.nop };
}
