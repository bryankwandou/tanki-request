/**
 * Posisi armada (butir 3.5 laporan review) — murni, tanpa I/O.
 *
 * Laporan meminta peta real-time seperti pelacakan paket, dan pada napas yang
 * sama mencatat itu butuh GPS tracker di setiap mobil tangki plus infrastruktur
 * lokasi — belum ada di PDAM. Rekomendasinya: jadikan fase 2.
 *
 * Yang dibangun di sini adalah separuh yang tidak butuh perangkat apa pun:
 * posisi diisi petugas, ditampilkan ke warga, lengkap dengan "diperbarui X
 * menit lalu" supaya tidak ada yang mengira angka basi adalah posisi sekarang.
 * Saat unit ber-GPS tiba, pengisinya diganti — bentuk datanya sudah sama.
 */

/** Rentang wajar Kota Makassar & sekitarnya, dipakai menolak salah ketik. */
export const BATAS_MAKASSAR = {
  latMin: -5.35,
  latMax: -4.95,
  lngMin: 119.3,
  lngMax: 119.65,
} as const;

export type ParsedKoordinat =
  | { ok: true; lat: number | null; lng: number | null }
  | { ok: false; error: string };

/**
 * Terima koordinat dari input operator.
 *
 * Keduanya harus diisi atau keduanya kosong: satu koordinat tanpa pasangannya
 * tidak menunjuk ke mana pun, dan menyimpannya setengah membuat halaman publik
 * menampilkan titik yang salah.
 */
export function parseKoordinat(latRaw: string, lngRaw: string): ParsedKoordinat {
  const a = latRaw.trim();
  const b = lngRaw.trim();
  if (!a && !b) return { ok: true, lat: null, lng: null };
  if (!a || !b)
    return { ok: false, error: "Isi Latitude dan Longitude sekaligus, atau kosongkan keduanya." };

  const lat = Number(a);
  const lng = Number(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng))
    return { ok: false, error: "Latitude/Longitude harus berupa angka desimal." };

  // Deteksi tertukar lebih dulu, karena inilah kesalahan yang paling sering
  // terjadi saat menyalin dari aplikasi peta — dan gejalanya (latitude 119)
  // kalau tidak dikenali akan keluar sebagai "di luar rentang bumi", pesan
  // yang benar tapi tidak menolong siapa pun.
  const dalamMakassar = (la: number, ln: number) =>
    la >= BATAS_MAKASSAR.latMin &&
    la <= BATAS_MAKASSAR.latMax &&
    ln >= BATAS_MAKASSAR.lngMin &&
    ln <= BATAS_MAKASSAR.lngMax;

  if (!dalamMakassar(lat, lng) && dalamMakassar(lng, lat))
    return {
      ok: false,
      error: "Latitude dan Longitude tampaknya tertukar. Periksa kembali urutannya.",
    };

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180)
    return { ok: false, error: "Latitude/Longitude di luar rentang koordinat bumi." };

  if (
    lat < BATAS_MAKASSAR.latMin ||
    lat > BATAS_MAKASSAR.latMax ||
    lng < BATAS_MAKASSAR.lngMin ||
    lng > BATAS_MAKASSAR.lngMax
  ) {
    // Kesalahan paling sering: latitude dan longitude tertukar.
    return {
      ok: false,
      error:
        "Koordinat berada jauh di luar Kota Makassar. Periksa apakah Latitude dan Longitude tertukar.",
    };
  }

  return { ok: true, lat, lng };
}

/**
 * "diperbarui 5 menit lalu".
 *
 * Wajib ditampilkan bersama posisinya: tanpa keterangan waktu, warga membaca
 * posisi tiga jam lalu sebagai posisi sekarang, lalu menyimpulkan mobilnya
 * mangkrak. Itu lebih buruk daripada tidak menampilkan posisi sama sekali.
 */
export function usiaPosisi(pada: Date | null, sekarang: number): string | null {
  if (!pada) return null;
  const selisih = sekarang - pada.getTime();
  if (selisih < 0) return "baru saja";

  const menit = Math.floor(selisih / 60_000);
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit lalu`;

  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.floor(jam / 24)} hari lalu`;
}

/** Posisi yang sudah terlalu tua tidak lagi bisa disebut "terkini". */
export const BATAS_BASI_MS = 6 * 60 * 60_000;

export function posisiBasi(pada: Date | null, sekarang: number): boolean {
  if (!pada) return true;
  return sekarang - pada.getTime() > BATAS_BASI_MS;
}

/**
 * Tautan peta.
 *
 * Sengaja TAUTAN, bukan peta yang ditanam. Menanam peta berarti memuat skrip
 * dan tile dari pihak ketiga di halaman publik PDAM — setiap warga yang
 * melacak permintaan air ikut terekspos ke penyedia peta itu. Untuk MVP,
 * tautan yang dibuka atas kehendak pengguna sudah cukup dan jauh lebih murah
 * secara privasi.
 */
export function tautanPeta(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}
