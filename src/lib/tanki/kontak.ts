/**
 * Pengumpulan kontak pelanggan dari riwayat permintaan (butir 3.4).
 *
 * Master `pelanggan` hasil impor PDAM tidak punya kolom nomor HP, jadi
 * pencocokan nomor tidak punya sumber data. Sumbernya ternyata sudah ada di
 * sistem ini sendiri: setiap permintaan mobil tangki meminta nomor HP pelapor.
 *
 * Yang membuat data itu layak dipercaya BUKAN sekadar "pernah dipakai
 * mengajukan". Siapa pun yang tahu No. Pelanggan orang lain bisa mengajukan
 * dengan nomornya sendiri; kalau nomor itu langsung dijadikan acuan, penyerang
 * yang mengajukan lebih dulu justru mengunci pemilik sahnya keluar.
 *
 * Karena itu kontak hanya dicatat dari permintaan yang sudah **diverifikasi
 * petugas PDAM** (status TERVERIFIKASI ke atas). Pada titik itu ada manusia
 * yang sudah menilai permintaan tersebut sah — bukti yang jauh lebih kuat
 * daripada sekadar penguasaan sebuah alamat email.
 *
 * Dan pencatatannya TIDAK menimpa. Kontak yang sudah ada hanya boleh diubah
 * dari sisi PDAM (loket/impor), supaya alur publik tidak pernah bisa dipakai
 * mengganti nomor terdaftar milik orang lain.
 */
import { db } from "@/lib/db";
import { normalisasiHp } from "@/lib/tanki/verifikasi-hp";

/** Status yang berarti "petugas sudah menilai permintaan ini sah". */
export const STATUS_TEPERCAYA = [
  "TERVERIFIKASI",
  "DIJADWALKAN",
  "DALAM_PERJALANAN",
  "SELESAI",
] as const;

/**
 * Catat nomor HP sebagai kontak terdaftar, HANYA bila pelanggan itu belum
 * punya kontak. Tidak pernah melempar: ini pekerjaan sampingan dari perubahan
 * status tiket, dan kegagalannya tidak boleh membatalkan pekerjaan operator.
 */
export async function catatKontakDariTiket(
  noPelanggan: string,
  noHp: string,
): Promise<{ dicatat: boolean }> {
  const nomor = normalisasiHp(noHp);
  if (!nomor || !/^\d{9}$/.test(noPelanggan)) return { dicatat: false };

  try {
    const ada = await db.pelangganKontak.findUnique({
      where: { nosamb: noPelanggan },
      select: { nosamb: true },
    });
    if (ada) return { dicatat: false };

    await db.pelangganKontak.create({
      data: { nosamb: noPelanggan, noHp: nomor, sumber: "verifikasi-petugas" },
    });
    return { dicatat: true };
  } catch {
    // Termasuk balapan dua operator yang memverifikasi bersamaan: yang kalah
    // kena unique constraint, dan itu justru hasil yang benar — tidak menimpa.
    return { dicatat: false };
  }
}
