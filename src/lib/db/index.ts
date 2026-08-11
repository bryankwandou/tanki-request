import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Parse the (mysql://) DATABASE_URL into a mariadb PoolConfig so the connection
// works regardless of URL scheme.
const url = new URL(process.env.DATABASE_URL);

/**
 * `?allowPublicKeyRetrieval=true` — khusus MySQL 8 lokal.
 *
 * Akun MySQL 8 memakai `caching_sha2_password`. Pada koneksi TANPA TLS, driver
 * mariadb menolak meminta kunci publik server sampai diizinkan eksplisit, jadi
 * container MySQL yang baru dibuat/di-restart membuat seluruh koneksi gagal
 * dengan "RSA public key is not available client side" — yang muncul di uji
 * lapis 3 sebagai "pool timeout ... active=0 idle=0" dan mudah disalahartikan
 * sebagai kebocoran koneksi.
 *
 * SENGAJA tidak dinyalakan otomatis: mengambil kunci publik lewat kanal yang
 * tidak terenkripsi bisa disadap MITM. Produksi harus memakai TLS ke database
 * (dan membiarkan opsi ini mati); yang butuh hanyalah pengembangan lokal
 * terhadap 127.0.0.1, tempat opsi ini ditulis di DATABASE_URL.
 */
const allowPublicKeyRetrieval =
  url.searchParams.get("allowPublicKeyRetrieval") === "true";

const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: url.port ? Number(url.port) : 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
  connectionLimit: 5,
  allowPublicKeyRetrieval,
});

export const db = globalThis.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = db;
}
