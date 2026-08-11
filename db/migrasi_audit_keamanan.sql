-- Tabel audit_keamanan — butir 3.2 Laporan Review UX & Keamanan (7 Agu 2026).
-- NON-DESTRUKTIF dan aman diulang: hanya CREATE TABLE IF NOT EXISTS.
--
-- Menyimpan jejak percobaan yang berpola serangan (kode OTP salah, jatah
-- tebakan habis, throttle terpicu) supaya lonjakan bisa dilihat SETELAH
-- kejadiannya lewat. Tanpa tabel ini satu-satunya jejak adalah kolom
-- `attempts` di otp_verifikasi, yang ikut hilang bersama barisnya.
--
-- `subjek` berisi HASH identitas (email / No. Pelanggan), bukan nilai aslinya —
-- lihat src/lib/tanki/audit.ts. Pengelompokan per subjek tetap bisa dilakukan
-- tanpa menjadikan tabel ini sumber kebocoran data pribadi yang baru.
--
-- Jalankan:
--   docker exec -i tanki-mysql mysql -uroot -p"$PASS" tanki_jene < db/migrasi_audit_keamanan.sql

CREATE TABLE IF NOT EXISTS audit_keamanan (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  jenis      VARCHAR(40)  NOT NULL,
  subjek     VARCHAR(64)  NULL,
  ip         VARCHAR(64)  NULL,
  detail     TEXT         NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  -- Query utamanya: "berapa kejadian jenis X dalam rentang waktu Y".
  KEY audit_keamanan_jenis_created_at_idx (jenis, created_at),
  KEY audit_keamanan_ip_created_at_idx (ip, created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
