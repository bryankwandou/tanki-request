/**
 * Pencocokan No. HP dengan kontak terdaftar pelanggan (butir 3.4 laporan review).
 *
 * Laporan meminta "cocokkan dengan nomor HP terdaftar di database pelanggan
 * PDAM, bukan nomor HP bebas yang diketik user". Masalahnya: tabel master
 * `pelanggan` (231k baris, hasil impor dari PDAM) TIDAK punya kolom nomor HP
 * sama sekali. Jadi data untuk memenuhinya belum ada.
 *
 * Yang bisa dibangun sekarang adalah mekanismenya, di tabel terpisah
 * `pelanggan_kontak` yang bisa diisi PDAM belakangan tanpa menyentuh master:
 *
 *   - Ada kontak terdaftar → No. HP yang diketik WAJIB cocok. Orang lain yang
 *     tahu No. Pelanggan korban tidak lagi bisa mengajukan atas nama mereka.
 *   - Belum ada kontak     → perilaku lama (terima). Ini yang membuat fitur ini
 *     bisa dipasang hari ini: keamanannya naik bertahap seiring PDAM mengisi
 *     data, bukan menunggu 231k baris lengkap lebih dulu.
 *   - Mode ketat (`verifikasi_hp_wajib`) → belum ada kontak berarti DITOLAK.
 *     Dinyalakan admin setelah datanya dianggap lengkap.
 *
 * Modul ini murni: keputusannya bisa diuji tanpa database.
 */

/**
 * Samakan bentuk nomor sebelum dibandingkan.
 *
 * Data kontak PDAM hampir pasti bercampur bentuk: "0812...", "62812...",
 * "+62 812-3456-7890". Membandingkan string mentah akan menolak pelanggan sah
 * hanya karena petugas mengetik dengan gaya berbeda — kegagalan yang jauh lebih
 * sering daripada serangan yang hendak dicegah.
 */
export function normalisasiHp(raw: string | null | undefined): string {
  if (!raw) return "";
  // Buang semua kecuali digit dan '+' di depan.
  let n = raw.trim().replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  // 62812… dan 812… → 0812…
  if (n.startsWith("62")) n = "0" + n.slice(2);
  else if (!n.startsWith("0") && n.length > 0) n = "0" + n;
  return n;
}

export type HasilVerifikasiHp =
  | { cocok: true; alasan: "terdaftar" | "belum-ada-data" }
  | { cocok: false; error: string };

/** Pesan tunggal untuk kedua kegagalan — lihat catatan di bawah. */
const TIDAK_COCOK =
  "No. HP tidak cocok dengan data pelanggan PDAM. Hubungi loket PDAM bila nomor Anda sudah berganti.";

/**
 * @param hpTerdaftar Nomor dari `pelanggan_kontak`, atau null bila belum ada.
 * @param hpDiketik   Nomor yang diisi warga di form.
 * @param wajib       Mode ketat: tanpa data kontak, tolak.
 */
export function verifikasiHp(
  hpTerdaftar: string | null,
  hpDiketik: string,
  wajib: boolean,
): HasilVerifikasiHp {
  const terdaftar = normalisasiHp(hpTerdaftar);
  const diketik = normalisasiHp(hpDiketik);

  if (!terdaftar) {
    if (!wajib) return { cocok: true, alasan: "belum-ada-data" };
    /**
     * Pesannya sengaja SAMA dengan "nomor tidak cocok".
     *
     * Kalau dibedakan ("nomor Anda belum terdaftar"), halaman ini berubah jadi
     * alat untuk memetakan No. Pelanggan mana yang sudah punya kontak di
     * database PDAM dan mana yang belum — informasi yang tidak perlu diberikan
     * ke siapa pun yang sekadar menebak nomor.
     */
    return { cocok: false, error: TIDAK_COCOK };
  }

  if (terdaftar !== diketik) return { cocok: false, error: TIDAK_COCOK };
  return { cocok: true, alasan: "terdaftar" };
}
