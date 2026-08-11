/**
 * Riwayat permintaan di perangkat sendiri (butir 3.3 laporan review).
 *
 * Laporan mencatat nomor tiket hanya tampil sekali di layar konfirmasi, jadi
 * pengguna yang menutup tab kehilangan satu-satunya salinan yang dia lihat.
 * Ini menyimpannya di localStorage peramban — tanpa akun, tanpa server, dan
 * tanpa mengubah apa pun di sisi backend.
 *
 * Yang disimpan sengaja MINIMAL: nomor tiket + No. Pelanggan, cukup untuk
 * mengisi ulang form lacak. No. HP, email, dan isi keluhan TIDAK ikut — ini
 * penyimpanan yang terbaca skrip mana pun pada origin ini, jadi semakin sedikit
 * yang ditaruh di sana semakin kecil kerugiannya bila ada XSS.
 *
 * Fungsi di berkas ini murni (bekerja atas array/string) supaya bisa diuji
 * tanpa DOM; komponen kliennya yang menyentuh localStorage.
 */

export const KUNCI_RIWAYAT = "tj_riwayat_lokal";

/** Cukup untuk beberapa musim kemarau; sisanya dibuang paling lama duluan. */
export const MAKS_ENTRI = 10;

export type EntriRiwayat = {
  noTiket: string;
  noPelanggan: string;
  /** epoch ms saat entri disimpan di perangkat ini. */
  disimpanPada: number;
};

function entriValid(v: unknown): v is EntriRiwayat {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Partial<EntriRiwayat>;
  return (
    typeof e.noTiket === "string" &&
    e.noTiket.length > 0 &&
    typeof e.noPelanggan === "string" &&
    typeof e.disimpanPada === "number" &&
    Number.isFinite(e.disimpanPada)
  );
}

/**
 * Baca isi localStorage yang mungkin rusak, ditulis versi lama, atau diisi
 * orang lain. Apa pun yang tidak berbentuk dibuang diam-diam — riwayat
 * kenyamanan tidak pernah boleh membuat halaman lacak gagal render.
 */
export function bacaRiwayat(raw: string | null): EntriRiwayat[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(entriValid).slice(0, MAKS_ENTRI);
  } catch {
    return [];
  }
}

/**
 * Tambahkan entri di paling depan, buang duplikat nomor tiket yang sama, dan
 * potong ke MAKS_ENTRI. Mengembalikan array baru — tidak mengubah masukannya.
 */
export function tambahEntri(
  daftar: EntriRiwayat[],
  entri: EntriRiwayat,
  maks: number = MAKS_ENTRI,
): EntriRiwayat[] {
  const sisa = daftar.filter((e) => e.noTiket !== entri.noTiket);
  return [entri, ...sisa].slice(0, maks);
}

export function hapusEntri(daftar: EntriRiwayat[], noTiket: string): EntriRiwayat[] {
  return daftar.filter((e) => e.noTiket !== noTiket);
}

/** Tautan lacak untuk satu entri — memakai jalur "No. Tiket + No. Pelanggan". */
export function tautanLacak(entri: EntriRiwayat): string {
  const q = new URLSearchParams({
    mode: "tiket",
    tiket: entri.noTiket,
    nop: entri.noPelanggan,
  });
  return `/lacak?${q.toString()}`;
}
