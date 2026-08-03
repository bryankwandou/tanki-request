import { auth } from "@/lib/auth";
import { canAccessApp } from "@/lib/auth/roles";

/**
 * Next.js 16 menamai middleware sebagai `proxy.ts`.
 * Hanya area operator (/dashboard/*) yang diproteksi; portal publik (/ , /lacak)
 * tetap terbuka tanpa login.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/dashboard")) return;

  /**
   * Route handler menjaga dirinya sendiri dan menjawab dengan status, bukan
   * halaman. Memantulkannya ke /auth/sign-in akan mengubah 403 yang bisa dibaca
   * klien menjadi 302 ke HTML — menyulitkan pemanggil membedakan "tidak berhak"
   * dari "sesi habis". Lihat ekspor laporan pada Issue #1.
   */
  if (pathname === "/dashboard/laporan/export") return;

  if (!req.auth || req.auth.error === "RefreshTokenError") {
    const signInUrl = new URL("/auth/sign-in", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return Response.redirect(signInUrl);
  }

  /**
   * Gerbang role ditegakkan DI SINI, bukan hanya di layout operator.
   *
   * Layout hanya memilih apa yang ditampilkan (`allowed ? children : panel`).
   * Di App Router, segmen halaman adalah segmen tersendiri yang tetap dirender
   * dan tetap ikut ke payload RSC, sehingga user tanpa role masih menerima
   * datanya walau layarnya bertuliskan "Akses ditolak" — pada /dashboard berupa
   * angka agregat, dan pada /dashboard/permintaan berupa nomor tiket, nomor
   * pelanggan, dan nomor HP pelapor.
   *
   * Ini penting justru karena SELURUH user realm DIAMOND bisa berautentikasi:
   * yang membedakan operator dari pegawai lain hanyalah role ini. Lihat Issue #2.
   */
  if (!canAccessApp(req.auth)) {
    const signInUrl = new URL("/auth/sign-in", req.nextUrl.origin);
    signInUrl.searchParams.set("error", "AccessDenied");
    return Response.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
