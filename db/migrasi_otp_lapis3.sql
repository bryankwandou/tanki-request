-- Migrasi otp_verifikasi untuk perbaikan Issue #4 — NON-DESTRUKTIF.
--
-- Menggantikan instruksi runbook `DELETE FROM otp_verifikasi WHERE status =
-- 'PENDING';` yang beredar di Issue #8. Instruksi itu tidak cukup: Prisma
-- menolak menambah kolom NOT NULL tanpa default selama tabel MASIH BERISI
-- baris apa pun, bukan hanya yang PENDING.
--
--   DELETE FROM otp_verifikasi WHERE status = 'PENDING';   -> sisa baris VERIFIED
--   npx prisma db push
--     Error: Added the required column `token` ... There are 1 rows in this table
--
-- Menghapus seluruh isi tabel memang membuat `db push` jalan, tapi ikut
-- membuang jejak audit permintaan yang sudah terverifikasi, dan memutus sesi
-- OTP pelanggan yang sedang berjalan saat deploy. Skrip ini menambah kolomnya
-- sambil mempertahankan barisnya.
--
-- Jalankan SEBELUM `npx prisma db push`:
--   docker exec -i tanki-mysql mysql -uroot -p"$PASS" tanki_jene < db/migrasi_otp_lapis3.sql
--
-- Aman diulang: setiap langkah memeriksa dirinya sendiri lebih dulu.

-- ---------------------------------------------------------------------------
-- 1. Kolom `token` — identitas publik permintaan OTP (Issue #4)
-- ---------------------------------------------------------------------------
SET @ada := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_verifikasi' AND COLUMN_NAME = 'token'
);
SET @sql := IF(@ada = 0,
  'ALTER TABLE otp_verifikasi ADD COLUMN token VARCHAR(64) NULL AFTER id',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Backfill dengan nilai acak per baris. Diberikan juga ke baris non-PENDING:
-- kolomnya UNIQUE dan NOT NULL, jadi seluruh baris harus punya nilai, dan
-- token milik baris yang sudah selesai tidak berguna bagi siapa pun.
--
-- RANDOM_BYTES(33) -> 44 karakter base64; diambil 43 dan dijadikan base64url
-- supaya cocok dengan TOKEN_RE di src/lib/tanki/otp.ts.
UPDATE otp_verifikasi
   SET token = REPLACE(REPLACE(LEFT(TO_BASE64(RANDOM_BYTES(33)), 43), '+', '-'), '/', '_')
 WHERE token IS NULL;

-- Indeks unik + NOT NULL baru dipasang setelah seluruh baris terisi.
SET @adaIdx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_verifikasi'
     AND INDEX_NAME = 'otp_verifikasi_token_key'
);
SET @sql := IF(@adaIdx = 0,
  'ALTER TABLE otp_verifikasi MODIFY COLUMN token VARCHAR(64) NOT NULL, ADD UNIQUE INDEX otp_verifikasi_token_key (token)',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 2. Kolom pendukung cap percobaan & kirim ulang (Issue #4)
-- ---------------------------------------------------------------------------
SET @ada := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_verifikasi' AND COLUMN_NAME = 'resend_count'
);
SET @sql := IF(@ada = 0,
  'ALTER TABLE otp_verifikasi ADD COLUMN resend_count INT NOT NULL DEFAULT 0',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @ada := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_verifikasi' AND COLUMN_NAME = 'last_sent_at'
);
SET @sql := IF(@ada = 0,
  'ALTER TABLE otp_verifikasi ADD COLUMN last_sent_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 3. Kolom `session_hash` — pengikat cookie HttpOnly (Issue #4, lapis kedua)
-- ---------------------------------------------------------------------------
-- Sengaja NULL, dan sengaja TIDAK di-backfill. Secret-nya hanya ada di cookie
-- browser pemohon; nilai yang dikarang di sini tidak akan pernah cocok dan
-- justru mengunci pelanggan yang sesinya sedang berjalan saat deploy. NULL
-- berarti "baris lama, belum terikat cookie" dan diperlakukan permisif oleh
-- secretCocok() di src/lib/tanki/otp.ts. Baris baru selalu mengisinya.
SET @ada := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_verifikasi' AND COLUMN_NAME = 'session_hash'
);
SET @sql := IF(@ada = 0,
  'ALTER TABLE otp_verifikasi ADD COLUMN session_hash VARCHAR(64) NULL AFTER token',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 4. Laporan
-- ---------------------------------------------------------------------------
SELECT
  COUNT(*)                                   AS baris_otp,
  SUM(token IS NULL)                         AS token_kosong,
  SUM(status = 'PENDING')                    AS masih_pending,
  COUNT(DISTINCT token)                      AS token_unik
FROM otp_verifikasi;
