/**
 * Log audit keamanan (butir 3.2 laporan review).
 *
 * Laporan meminta "catat log percobaan gagal untuk deteksi anomali". Tanpa ini,
 * satu-satunya jejak brute-force adalah kolom `attempts` yang ikut terhapus
 * bersama barisnya — jadi tidak ada yang bisa menjawab "apakah semalam ada yang
 * mencoba?" setelah kejadiannya lewat.
 *
 * Dua aturan yang menentukan bentuk modul ini:
 *
 *  1. TIDAK PERNAH menyimpan identitas mentah. Email dan No. Pelanggan disimpan
 *     sebagai hash, jadi pola "subjek yang sama gagal 400 kali" tetap terlihat
 *     tanpa membuat tabel audit jadi sumber kebocoran data pribadi yang baru.
 *
 *  2. TIDAK PERNAH melempar. Audit adalah pengamatan, bukan bagian dari alur
 *     pengguna: kalau tabelnya belum ada atau database sedang bermasalah, warga
 *     tetap harus bisa mengajukan permintaan air.
 */
import crypto from "node:crypto";
import { db } from "@/lib/db";

export const AUDIT = {
  /** Kode OTP salah ditebak. */
  OTP_KODE_SALAH: "OTP_KODE_SALAH",
  /** Jatah tebakan satu permintaan habis — indikasi kuat brute-force. */
  OTP_CAP_HABIS: "OTP_CAP_HABIS",
  /** Rate limiter menolak percobaan verifikasi. */
  OTP_THROTTLE: "OTP_THROTTLE",
  /** Pencarian di /lacak ditolak karena terlalu sering — indikasi enumerasi. */
  LACAK_THROTTLE: "LACAK_THROTTLE",
} as const;

export type JenisAudit = (typeof AUDIT)[keyof typeof AUDIT];

/**
 * Hash identitas untuk kolom `subjek`.
 *
 * Di-salt dengan AUTH_SECRET supaya hash-nya tidak bisa dibalik dengan
 * mencocokkan daftar email atau menyapu 10^9 kemungkinan No. Pelanggan —
 * SHA-256 polos atas ruang sekecil itu praktis sama dengan menyimpan aslinya.
 */
export function subjekHash(nilai: string | null | undefined): string | null {
  if (!nilai) return null;
  const salt = process.env.AUTH_SECRET ?? "";
  return crypto
    .createHash("sha256")
    .update(`${salt}:${nilai.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 64);
}

export type CatatanAudit = {
  jenis: JenisAudit;
  /** Identitas mentah — modul ini yang meng-hash-nya, pemanggil tidak perlu. */
  subjek?: string | null;
  ip?: string | null;
  detail?: string | null;
};

export async function catatAudit(c: CatatanAudit): Promise<void> {
  try {
    await db.auditKeamanan.create({
      data: {
        jenis: c.jenis,
        subjek: subjekHash(c.subjek),
        ip: c.ip ?? null,
        detail: c.detail ?? null,
      },
    });
  } catch {
    // Sengaja bisu — lihat aturan 2 di atas.
  }
}

/**
 * Ringkasan untuk operator: berapa kejadian per jenis dalam N jam terakhir.
 * Dipakai halaman dashboard supaya lonjakan tidak hanya tersimpan, tapi terlihat.
 */
export async function ringkasanAudit(jam = 24) {
  const sejak = new Date(Date.now() - jam * 60 * 60_000);
  try {
    const rows = await db.auditKeamanan.groupBy({
      by: ["jenis"],
      where: { createdAt: { gte: sejak } },
      _count: { _all: true },
    });
    return rows.map((r) => ({ jenis: r.jenis, jumlah: r._count._all }));
  } catch {
    return [];
  }
}
