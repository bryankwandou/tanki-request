-- Tabel pelanggan_kontak — butir 3.4 Laporan Review UX & Keamanan (7 Agu 2026).
-- NON-DESTRUKTIF dan aman diulang.
--
-- Laporan meminta No. HP yang diketik warga dicocokkan dengan nomor terdaftar
-- di database pelanggan PDAM. Tabel master `pelanggan` (hasil impor
-- pelanggan.sql, ~231k baris) tidak punya kolom nomor HP sama sekali, jadi
-- datanya harus datang dari tempat lain.
--
-- Sengaja TABEL TERPISAH, bukan kolom baru di `pelanggan`:
--   1. `pelanggan` diperlakukan read-only dan bisa di-drop lalu diimpor ulang
--      dari dump PDAM; kontak yang sudah dikumpulkan loket tidak boleh ikut
--      terbuang setiap kali itu terjadi.
--   2. Pengisiannya bertahap. Pelanggan yang kontaknya belum ada tetap bisa
--      mengajukan (kecuali admin menyalakan mode ketat).
--
-- Pengisian dilakukan dari sisi PDAM, contoh:
--   LOAD DATA LOCAL INFILE 'kontak.csv' INTO TABLE pelanggan_kontak
--     FIELDS TERMINATED BY ',' IGNORE 1 LINES (nosamb, no_hp)
--     SET sumber = 'impor-loket-2026';
--
-- Jalankan:
--   docker exec -i tanki-mysql mysql -uroot -p"$PASS" tanki_jene < db/migrasi_pelanggan_kontak.sql

CREATE TABLE IF NOT EXISTS pelanggan_kontak (
  nosamb     CHAR(9)     NOT NULL,
  no_hp      VARCHAR(20) NOT NULL,
  sumber     VARCHAR(40) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (nosamb),
  KEY pelanggan_kontak_no_hp_idx (no_hp)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
