# Keputusan Desain — Tanki Je'ne'

Catatan keputusan yang sengaja diambil, beserta alasannya. Tujuannya supaya
pertanyaan yang sudah dijawab tidak diusulkan ulang setiap ganti tim, dan
supaya yang membaca kode tahu mana yang "belum sempat" dan mana yang "memang
diputuskan begitu".

---

## KD-01 · CAPTCHA TIDAK dipakai

**Status:** diputuskan · **Tanggal:** 11 Agustus 2026
**Terkait:** butir 3.2 Laporan Review UX & Keamanan (7 Agu 2026)

Laporan review menyarankan "pertimbangkan CAPTCHA setelah beberapa kali gagal".
Setelah ditimbang, **CAPTCHA tidak akan dipasang.**

**Alasan:**

1. **Gerbangnya sudah ada, dan lebih kuat.** Setiap permintaan mobil tangki
   menuntut kode OTP yang dikirim ke email pelapor. Tiket baru dibuat *setelah*
   kode itu terverifikasi. CAPTCHA membuktikan "ada manusia di sini"; OTP
   membuktikan "ada manusia yang menguasai kotak masuk email ini" — pernyataan
   yang lebih kuat dan lebih relevan untuk layanan publik berbasis identitas
   pelanggan.

2. **Lapisannya sudah berlapis.** Rate limiting per IP/email/permintaan, cap
   percobaan yang tidak pulih saat kirim ulang, delay progresif, cooldown antar
   pengajuan yang tersimpan di database, dan log audit anomali. CAPTCHA
   ditambahkan di atas itu memberi tambahan yang kecil.

3. **Biaya lisensi tidak sepadan.** Ini anggaran negara. Uangnya lebih berguna
   untuk layanan warga daripada untuk lisensi tahunan yang menutup celah yang
   sudah tertutup.

4. **Ia menghukum warga yang paling butuh.** CAPTCHA gambar menyulitkan
   pengguna lanjut usia, pengguna dengan gangguan penglihatan, dan pengguna
   pembaca layar. Untuk situs pemerintah yang wajib aksesibel, memasangnya
   berarti berutang alternatif aksesibel — pekerjaan tambahan demi keamanan
   yang tidak bertambah.

**Yang akan mengubah keputusan ini:** bukti nyata penyalahgunaan otomatis yang
lolos dari seluruh lapisan di atas — terlihat dari tabel `audit_keamanan`,
bukan dari dugaan. Bila itu terjadi, langkah pertama adalah memperketat batas
yang sudah ada, bukan langsung membeli CAPTCHA.

---

## KD-02 · Tidak ada sistem akun untuk warga

**Status:** diputuskan · **Terkait:** butir 3.6 & 3.8

Login opsional dibangun tanpa tabel user, kata sandi, atau reset password.
Sesi diterbitkan setelah warga membuktikan menguasai email yang terpaut pada
permintaannya (kode OTP), lalu disimpan sebagai cookie bertanda tangan HMAC.

Kata sandi berarti: penyimpanan hash, alur lupa sandi, kebijakan kedaluwarsa,
dan kebocoran kredensial yang bisa dipakai ulang di layanan lain — semuanya
beban baru bagi PDAM, demi bukti kepemilikan yang tidak lebih kuat daripada
yang sudah kita punya.

---

## KD-03 · Peta ditampilkan sebagai tautan, bukan peta tertanam

**Status:** diputuskan · **Terkait:** butir 3.5

Menanam peta berarti memuat skrip dan tile dari penyedia pihak ketiga di
halaman publik PDAM, sehingga setiap warga yang melacak permintaan air ikut
terekspos ke penyedia itu. Tautan yang dibuka atas kehendak pengguna memberi
manfaat yang sama tanpa biaya privasi tersebut.

---

## KD-04 · Kontak pelanggan dikumpulkan dari permintaan yang diverifikasi petugas

**Status:** diputuskan · **Terkait:** butir 3.4

Master `pelanggan` dari PDAM tidak memuat nomor HP. Sumber datanya diambil dari
riwayat permintaan — tapi **hanya** dari permintaan yang sudah dinaikkan
statusnya oleh petugas (TERVERIFIKASI ke atas).

Alasannya: siapa pun yang tahu No. Pelanggan orang lain bisa mengajukan dengan
nomornya sendiri. Kalau nomor itu langsung dijadikan acuan, penyerang yang
mengajukan lebih dulu justru mengunci pemilik sahnya keluar dari layanan.
Penilaian petugas adalah bukti yang jauh lebih kuat.

Kontak yang sudah ada tidak pernah ditimpa oleh alur publik.
