// ESLint 9 memakai "flat config"; `.eslintrc.json` tidak lagi dibaca secara
// bawaan. Berkas ini menjembatani konfigurasi lama (next/core-web-vitals) ke
// format baru lewat FlatCompat, jadi aturannya persis sama seperti sebelumnya.
//
// Latar: `npm run lint` dulu memanggil `next lint`, yang DIHAPUS di Next 16 dan
// gagal dengan "Invalid project directory provided, no such directory: .../lint".
// Sekarang skrip itu memanggil eslint langsung.
import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      // Keluaran generator Prisma — bukan kode yang kita tulis atau rawat.
      "src/generated/**",
      // Aset template pihak ketiga yang dibawa apa adanya.
      "src/js/**",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
];

export default config;
