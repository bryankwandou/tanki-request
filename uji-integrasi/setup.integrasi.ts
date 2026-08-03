import { loadEnvConfig } from "@next/env";

// Baca .env proyek persis seperti Next melakukannya, supaya DATABASE_URL,
// REDIS_URL, dan CONFIG_ENCRYPTION_KEY yang dipakai uji sama dengan yang
// dipakai aplikasi saat berjalan.
loadEnvConfig(process.cwd());
