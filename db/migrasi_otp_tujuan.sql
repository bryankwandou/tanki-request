-- Kolom `tujuan` pada otp_verifikasi — butir 3.6 (masuk tanpa mengajukan).
-- NON-DESTRUKTIF dan aman diulang.
--
-- Membedakan kode OTP yang diterbitkan untuk MEMBUAT TIKET dari kode yang
-- diterbitkan untuk MASUK. Pembedaan ini bukan kerapian belaka: tanpa itu,
-- kode yang diminta warga untuk "masuk melihat riwayat" bisa dipakai
-- menyelesaikan pembuatan permintaan mobil tangki, dan sebaliknya.
--
-- Default 'TIKET' supaya seluruh baris lama tetap bermakna persis seperti
-- sebelumnya.
--
-- Jalankan SEBELUM `npx prisma db push`:
--   docker exec -i tanki-mysql mysql -uroot -p"$PASS" tanki_jene < db/migrasi_otp_tujuan.sql

SET @ada := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='otp_verifikasi' AND COLUMN_NAME='tujuan');
SET @sql := IF(@ada=0,
  "ALTER TABLE otp_verifikasi ADD COLUMN tujuan ENUM('TIKET','MASUK') NOT NULL DEFAULT 'TIKET' AFTER kode_hash",
  'SELECT "kolom tujuan sudah ada"');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
