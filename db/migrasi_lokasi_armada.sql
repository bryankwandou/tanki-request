-- Kolom posisi armada pada tabel penugasan — butir 3.5 laporan review.
-- NON-DESTRUKTIF dan aman diulang: setiap langkah memeriksa dirinya sendiri.
--
-- Laporan meminta peta real-time seperti pelacakan paket e-commerce, dan
-- sekaligus mencatat bahwa itu butuh GPS tracker di setiap mobil tangki —
-- perangkat yang belum dimiliki PDAM. Kolom ini jalan tengahnya: posisi
-- diperbarui petugas lewat dashboard sekarang, dan diisi umpan GPS nanti
-- tanpa mengubah bentuk data atau halaman publiknya.
--
-- Jalankan:
--   docker exec -i tanki-mysql mysql -uroot -p"$PASS" tanki_jene < db/migrasi_lokasi_armada.sql

SET @db := DATABASE();

SET @ada := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=@db AND TABLE_NAME='penugasan' AND COLUMN_NAME='lokasi_teks');
SET @sql := IF(@ada=0,
  'ALTER TABLE penugasan ADD COLUMN lokasi_teks VARCHAR(200) NULL AFTER assigned_by',
  'SELECT "lokasi_teks sudah ada"');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @ada := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=@db AND TABLE_NAME='penugasan' AND COLUMN_NAME='lokasi_lat');
SET @sql := IF(@ada=0,
  'ALTER TABLE penugasan ADD COLUMN lokasi_lat DECIMAL(10,8) NULL AFTER lokasi_teks',
  'SELECT "lokasi_lat sudah ada"');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @ada := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=@db AND TABLE_NAME='penugasan' AND COLUMN_NAME='lokasi_lng');
SET @sql := IF(@ada=0,
  'ALTER TABLE penugasan ADD COLUMN lokasi_lng DECIMAL(11,8) NULL AFTER lokasi_lat',
  'SELECT "lokasi_lng sudah ada"');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @ada := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=@db AND TABLE_NAME='penugasan' AND COLUMN_NAME='lokasi_pada');
SET @sql := IF(@ada=0,
  'ALTER TABLE penugasan ADD COLUMN lokasi_pada DATETIME(3) NULL AFTER lokasi_lng',
  'SELECT "lokasi_pada sudah ada"');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
