-- Anti double-booking untuk penugasan (FR-42).
-- MySQL tidak punya partial unique index, jadi kita pakai generated column yang
-- hanya bernilai saat penugasan AKTIF (DIJADWALKAN/BERANGKAT), lalu UNIQUE key.
-- Efek: satu kendaraan / sopir / tiket hanya boleh punya 1 penugasan aktif
-- (banyak baris non-aktif boleh, karena NULL tidak melanggar UNIQUE).
--
-- Memakai VIRTUAL (bukan STORED): penambahan kolom bersifat INSTANT sehingga
-- tidak memicu rebuild tabel — penting karena penugasan punya foreign key
-- (STORED akan gagal dengan error 1215 saat InnoDB merebuild tabel ber-FK).
--
-- CATATAN: kolom ini di luar Prisma schema. Bila Anda menjalankan
-- `prisma db push` lagi, kolom generated bisa terhapus — jalankan ulang file ini.
-- (Overlap rentang jadwal penuh tetap divalidasi di level aplikasi.)

ALTER TABLE penugasan ADD COLUMN kendaraan_aktif BIGINT
  GENERATED ALWAYS AS (CASE WHEN status IN ('DIJADWALKAN','BERANGKAT') THEN kendaraan_id END) VIRTUAL;
ALTER TABLE penugasan ADD COLUMN sopir_aktif BIGINT
  GENERATED ALWAYS AS (CASE WHEN status IN ('DIJADWALKAN','BERANGKAT') THEN sopir_id END) VIRTUAL;
ALTER TABLE penugasan ADD COLUMN tiket_aktif BIGINT
  GENERATED ALWAYS AS (CASE WHEN status IN ('DIJADWALKAN','BERANGKAT') THEN tiket_id END) VIRTUAL;

ALTER TABLE penugasan ADD UNIQUE KEY uq_kendaraan_aktif (kendaraan_aktif);
ALTER TABLE penugasan ADD UNIQUE KEY uq_sopir_aktif (sopir_aktif);
ALTER TABLE penugasan ADD UNIQUE KEY uq_tiket_aktif (tiket_aktif);
