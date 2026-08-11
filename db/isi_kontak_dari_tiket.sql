-- Isi pelanggan_kontak dari RIWAYAT PERMINTAAN yang sudah ada — butir 3.4.
-- NON-DESTRUKTIF dan aman diulang.
--
-- Master `pelanggan` dari PDAM tidak punya kolom nomor HP, jadi pencocokan
-- nomor tidak punya sumber data. Sumbernya sudah ada di sistem ini sendiri:
-- setiap permintaan mobil tangki meminta nomor HP pelapor.
--
-- YANG MENENTUKAN KELAYAKANNYA: hanya permintaan yang sudah DIVERIFIKASI
-- PETUGAS yang dipakai. Alasannya penting —
--
--   Siapa pun yang tahu No. Pelanggan orang lain bisa mengajukan dengan nomor
--   HP-nya sendiri. Kalau nomor itu langsung dijadikan acuan, penyerang yang
--   mengajukan lebih dulu justru mengunci pemilik sahnya keluar dari layanan.
--   Status TERVERIFIKASI ke atas berarti ada petugas PDAM yang sudah menilai
--   permintaan itu sah — bukti yang jauh lebih kuat daripada sekadar
--   penguasaan sebuah alamat email.
--
-- Bila satu No. Pelanggan punya beberapa permintaan terverifikasi dengan nomor
-- berbeda, yang diambil adalah nomor pada permintaan TERBARU: orang berganti
-- nomor HP, dan yang paling terakhir dinilai sah petugas adalah yang berlaku.
--
-- INSERT IGNORE, bukan REPLACE: kontak yang sudah ada TIDAK ditimpa. Kontak
-- hasil pendataan loket lebih tepercaya daripada tebakan dari riwayat.
--
-- Jalankan:
--   docker exec -i tanki-mysql mysql -uroot -p"$PASS" tanki_jene < db/isi_kontak_dari_tiket.sql
--
-- Periksa dampaknya SEBELUM menjalankan (ganti INSERT IGNORE ... dengan SELECT
-- pada blok di bawah) bila ingin melihat dulu berapa baris yang akan masuk.

INSERT IGNORE INTO pelanggan_kontak (nosamb, no_hp, sumber)
SELECT t.no_pelanggan,
       t.no_hp,
       'riwayat-terverifikasi'
  FROM tiket t
  JOIN (
        -- Permintaan terverifikasi TERBARU per pelanggan.
        SELECT no_pelanggan, MAX(id) AS id_terbaru
          FROM tiket
         WHERE status IN ('TERVERIFIKASI', 'DIJADWALKAN', 'DALAM_PERJALANAN', 'SELESAI')
         GROUP BY no_pelanggan
       ) terbaru
    ON terbaru.id_terbaru = t.id
 WHERE t.no_hp IS NOT NULL
   AND t.no_hp <> '';

SELECT CONCAT('pelanggan_kontak sekarang berisi ', COUNT(*), ' baris') AS hasil
  FROM pelanggan_kontak;
