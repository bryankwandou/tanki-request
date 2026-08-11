/** @type {import("next").NextConfig} */
const nextConfig = {
  // Dibutuhkan image Docker: menghasilkan .next/standalone berisi server.js +
  // hanya node_modules yang benar-benar terpakai. Tidak berpengaruh pada
  // `next dev` maupun alur build yang sudah ada.
  output: "standalone",

  /**
   * Server Actions di balik penerusan port / reverse proxy.
   *
   * Next menolak Server Action bila host pada header `Origin` berbeda dari
   * `x-forwarded-host`. Itu proteksi CSRF yang benar dan tidak boleh dimatikan.
   *
   * Tapi saat aplikasi diakses lewat penerusan port (Codespaces/VS Code), proxy
   * mengisi `x-forwarded-host` dengan domain publiknya sementara browser tetap
   * mengirim `Origin: localhost:3000`. Keduanya sah, tapi tidak sama, sehingga
   * SETIAP tombol berhenti bekerja dengan pesan "Invalid Server Actions
   * request" — kirim kode masuk, ajukan permintaan, verifikasi OTP, semuanya.
   * Halaman tetap tampil normal, jadi kerusakan ini tidak terlihat dari uji
   * yang hanya memeriksa render.
   *
   * Yang didaftarkan di sini adalah nilai `Origin` yang dianggap sah — itulah
   * yang dibandingkan Next (`isCsrfOriginAllowed(originHost, allowedOrigins)`),
   * bukan host proxy-nya. Mendaftarkan origin localhost aman: halaman penyerang
   * di domain lain tidak bisa memalsukan header `Origin` milik browser.
   *
   * Domain produksi PDAM diisi lewat `SERVER_ACTIONS_ALLOWED_ORIGINS`
   * (dipisah koma) supaya ditentukan saat deploy, bukan dipaku di dalam kode.
   */
  experimental: {
    serverActions: {
      allowedOrigins: [
        ...(process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? "")
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
        "localhost:3000",
        "localhost:3100",
      ],
    },
  },

  images: {
    qualities: [75, 100],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        port: ""
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        port: ""
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        port: ""
      },
      {
        protocol: "https",
        hostname: "pub-b7fd9c30cdbf439183b75041f5f71b92.r2.dev",
        port: ""
      }
    ]
  }
};

export default nextConfig;
