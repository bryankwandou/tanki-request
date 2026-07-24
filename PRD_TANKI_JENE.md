# PRODUCT REQUIREMENTS DOCUMENT (PRD)

# Tanki Je'ne'

**Sistem Informasi Permintaan Layanan Mobil Tangki**

*PDAM Kota Makassar*

Disusun oleh PT Flash Informatika Cemerlang (FIC)

Versi 0.4 — DRAFT untuk Review · 28 Juni 2026

> **Catatan nama produk:** *Je'ne'* berarti "air" dalam bahasa Makassar, sehingga **Tanki Je'ne'** = "Tangki Air" — branding lokal untuk layanan mobil tangki PDAM Kota Makassar.

---

## Informasi Dokumen

| Atribut | Keterangan |
|----|----|
| Nama Produk | **Tanki Je'ne'** — Sistem Informasi Permintaan Layanan Mobil Tangki |
| Pemilik Produk (Client) | PDAM Kota Makassar |
| Vendor / Pengembang | PT Flash Informatika Cemerlang (FIC) |
| Tipe Aplikasi | Web application (responsive), dapat diakses via browser Android, iOS & desktop |
| Stack Teknis | Next.js (front-end + back-end), MySQL (database), Keycloak (IAM operator) |
| Kanal Notifikasi | Email (SMTP / email transaksional) |
| Versi Dokumen | 0.4 (Draft) |
| Status | Menunggu review |
| Tanggal | 28 Juni 2026 |

## Riwayat Revisi

| Versi | Tanggal | Deskripsi Perubahan | Penyusun |
|----|----|----|----|
| 0.1 | 28 Jun 2026 | Draft awal — alur pelanggan, anti-fraud, tracking antrian, integrasi Keycloak, WA & email. | FIC |
| 0.2 | 28 Jun 2026 | Rebranding ke **Tanki Je'ne'**; kanal notifikasi **email saja** (WhatsApp dipindah ke fase berikut); **OTP via email** yang dapat dikonfigurasi admin PDAM menggantikan arithmetic challenge; anti-bot **rate limiter saja**; tracking publik via **No. Pelanggan + No. HP**; stack difinalkan **Next.js + MySQL** (Keycloak tetap untuk operator). | FIC |
| 0.3 | 28 Jun 2026 | Penyelarasan infrastruktur dengan ekosistem PDAM: VPS/Docker host pola **billing-pdam**; **Keycloak di-reuse dari instance terpusat `DIAMOND`** (`https://diamond.pdammakassar.co.id/auth`) yang sudah dipakai **pdam-hrms** & pdam-hubungan-pelanggan — cukup tambah client `tanki-jene`. | FIC |
| 0.4 | 28 Jun 2026 | Tambah modul operator: Dashboard, Dispatch/Armada, Laporan, Pencarian Permintaan & Pelanggan (FR-36..FR-49); skema kendaraan/sopir/penugasan + kolom snapshot di tiket + DDL pelanggan final; finalisasi adopsi template NextAdmin + auth Auth.js/Keycloak. | FIC |

---

## Daftar Isi

1. [Pendahuluan](#1-pendahuluan)
2. [Gambaran Umum Produk](#2-gambaran-umum-produk)
3. [Alur Proses Bisnis](#3-alur-proses-bisnis)
4. [Kebutuhan Fungsional](#4-kebutuhan-fungsional)
5. [Autentikasi & Otorisasi (Keycloak)](#5-autentikasi--otorisasi-keycloak)
6. [Kebutuhan Non-Fungsional](#6-kebutuhan-non-fungsional)
7. [Arsitektur Teknis & Integrasi](#7-arsitektur-teknis--integrasi)
8. [Skema Data (Konseptual)](#8-skema-data-konseptual)
9. [Asumsi, Batasan & Risiko](#9-asumsi-batasan--risiko)
10. [Rencana Pengembangan (Phasing)](#10-rencana-pengembangan-phasing)
11. [Infrastruktur, VPS & Deployment (Selaras dengan billing-pdam)](#11-infrastruktur-vps--deployment-selaras-dengan-billing-pdam)

---

## 1. Pendahuluan

### 1.1 Latar Belakang

Pada kondisi tertentu (gangguan distribusi, pemeliharaan jaringan, atau wilayah yang belum terjangkau pipa), pelanggan PDAM membutuhkan suplai air melalui mobil tangki. Saat ini permintaan layanan mobil tangki umumnya diajukan secara manual (telepon/datang langsung), sehingga sulit ditelusuri, rentan permintaan fiktif, dan pelanggan tidak memiliki kepastian apakah permintaannya sedang diproses.

**Tanki Je'ne'** hadir sebagai kanal digital tunggal bagi warga untuk mengajukan permintaan mobil tangki, sekaligus memberi transparansi posisi antrian dan progres layanan — analog dengan modul antrian pada layanan publik seperti JKN. Bagi PDAM, sistem ini menyediakan dashboard operator untuk verifikasi, penjadwalan, dan monitoring permintaan secara terpusat.

> **Catatan Strategis**
> - Tujuan jangka pendek: memperkenalkan produk-produk PT Flash kepada jajaran Direksi PDAM melalui use case yang familiar dan berdampak langsung ke pelayanan warga.
> - Modul Mobil Tangki ini diposisikan sebagai *showcase* yang ringan namun lengkap (end-to-end), agar mudah dipahami non-teknis.

### 1.2 Tujuan

1. Menyediakan kanal *self-service* berbasis web bagi warga untuk mengajukan permintaan mobil tangki.
2. Mengurangi permintaan fiktif melalui validasi nomor pelanggan terhadap master data, **OTP via email** (bila diaktifkan), dan **rate limiting** anti-bot.
3. Memberi transparansi: warga dapat memantau nomor tiket, posisi antrian, dan progres layanan.
4. Mengirim notifikasi tiket dan update progres ke **email** pelanggan.
5. Menyediakan dashboard operator PDAM dengan kontrol akses berbasis *role* melalui Keycloak (SSO).

### 1.3 Ruang Lingkup

**Termasuk dalam Lingkup (In-Scope)**

- Form permintaan layanan mobil tangki untuk warga (akses publik, tanpa login).
- Validasi Nomor Pelanggan (9 digit) terhadap master data pelanggan.
- Mekanisme anti-fraud: **rate limiting** (anti-bot/spam) + **OTP via email** yang dapat dikonfigurasi admin PDAM.
- Generate nomor tiket dan halaman *tracking* antrian publik.
- **Tracking publik** dengan memasukkan **No. Pelanggan + No. HP** pada web.
- Notifikasi via **email** saat submit dan setiap perubahan status.
- Dashboard operator: kelola tiket, update status/progres, monitoring antrian.
- **Konfigurasi admin PDAM**: mengaktifkan/menonaktifkan OTP email, masa berlaku & panjang OTP, template email.
- Authentication & authorization operator/admin via **Keycloak (OIDC)** dengan role CRUD, Read-only, dan Admin.

**Di Luar Lingkup (Out-of-Scope) — Fase Ini**

- Integrasi pembayaran / billing mobil tangki.
- Penjadwalan rute & tracking GPS armada secara real-time.
- Aplikasi mobile native (Android/iOS) — cukup web responsive.
- Notifikasi & OTP via WhatsApp/SMS (dicatat sebagai opsi peningkatan di masa depan).

### 1.4 Definisi & Istilah

| Istilah | Definisi |
|----|----|
| Pelanggan / Warga | Pengguna publik yang mengajukan permintaan mobil tangki; tidak memiliki akun. |
| Nomor Pelanggan | Identitas pelanggan PDAM sepanjang 9 digit, digunakan sebagai kunci validasi. |
| Nomor HP | Nomor telepon pelanggan; wajib diisi dan menjadi salah satu kunci pencarian *tracking* publik. |
| Operator PDAM | Pengguna internal PDAM yang mengelola/memantau tiket; login via Keycloak. |
| Admin PDAM | Pengguna internal yang mengkonfigurasi sistem (OTP email, template, parameter); login via Keycloak. |
| Tiket | Catatan satu permintaan layanan mobil tangki, memiliki nomor unik dan status. |
| OTP Email | Kode sekali pakai (One-Time Password) yang dikirim ke email pelanggan untuk verifikasi sebelum submit; dapat diaktifkan/dinonaktifkan admin. |
| Rate Limiting | Pembatasan jumlah permintaan per No. Pelanggan dan/atau IP dalam rentang waktu tertentu untuk mencegah spam/bot. |
| Keycloak | Identity & Access Management (IAM) untuk SSO, authentication, dan role management operator/admin. |
| Email Gateway | Layanan pengiriman email (SMTP / penyedia email transaksional). |

---

## 2. Gambaran Umum Produk

### 2.1 Deskripsi Produk

**Tanki Je'ne'** adalah aplikasi web berbasis **Next.js** (monolith — front-end & back-end dalam satu basis kode) yang terdiri dari dua area utama:

1. **Portal Publik** untuk warga — mengajukan permintaan dan memantau antrian tanpa perlu login.
2. **Dashboard Operator/Admin** untuk internal PDAM — terproteksi melalui Keycloak.

Sistem terhubung ke master data pelanggan PDAM (**MySQL**) untuk validasi dan auto-fill data, serta ke kanal notifikasi **email** (SMTP / email transaksional) untuk pengiriman OTP dan update progres.

### 2.2 Target Pengguna

- **Warga / pelanggan PDAM** — membutuhkan suplai mobil tangki dan kepastian layanan.
- **Operator PDAM** — memverifikasi, menjadwalkan, dan memperbarui status permintaan.
- **Admin PDAM** — mengkonfigurasi parameter sistem (OTP email, template notifikasi).
- **Direksi / Manajemen PDAM** — memantau volume dan kinerja layanan (akses read-only).

### 2.3 Karakteristik & Hak Akses Pengguna (Role Matrix)

| Role | Metode Akses | Hak Akses |
|----|----|----|
| Pelanggan (Warga) | Publik — tanpa login | Submit permintaan; cek status & posisi antrian via **No. Pelanggan + No. HP**. |
| Operator PDAM (CRUD) | Login via Keycloak | Akses penuh: lihat, verifikasi, ubah status, kelola seluruh tiket & data layanan. |
| Operator PDAM (Read-only) | Login via Keycloak | Hanya melihat tiket, antrian, dan laporan — tanpa hak ubah. Cocok untuk Direksi/monitoring. |
| Admin PDAM | Login via Keycloak | Konfigurasi sistem: aktif/nonaktif OTP email, parameter OTP, template email, plus seluruh hak Operator CRUD. |

> **Prinsip Pemisahan Akses**
> - Portal warga TIDAK menggunakan Keycloak dan tidak memerlukan akun — agar friksi serendah mungkin.
> - Hanya area operator/admin yang dilindungi Keycloak; otorisasi ditentukan oleh *realm role*.

---

## 3. Alur Proses Bisnis

### 3.1 Alur Pelanggan (Warga)

1. Warga membuka portal **Tanki Je'ne'** melalui browser (mobile/desktop).
2. Warga memasukkan **Nomor Pelanggan** (9 digit).
3. Sistem memvalidasi nomor terhadap master data; bila valid, **Nama & Alamat** ditampilkan otomatis (auto-fill, read-only).
4. Warga melengkapi **Nomor HP** (wajib), **Email**, dan **Keluhan/keterangan** permintaan.
   - Bila OTP email **aktif**, email **wajib** diisi (sebagai tujuan pengiriman OTP).
   - Bila OTP email **nonaktif**, email tetap dianjurkan agar warga menerima notifikasi progres.
5. **[Bila OTP email aktif]** Sistem mengirim kode OTP ke email warga; warga memasukkan kode OTP untuk verifikasi.
6. **Rate limiting** membatasi jumlah permintaan per No. Pelanggan/IP untuk mencegah spam & bot.
7. Warga submit; sistem membuat tiket dengan nomor unik berstatus **DITERIMA**.
8. Sistem mengirim **nomor tiket + tautan tracking** ke **email** warga.
9. Warga memantau progres dengan dua cara:
   - menerima **update progres via email** pada setiap perubahan status; **atau**
   - membuka halaman *tracking* dan memasukkan **No. Pelanggan + No. HP** kapan saja.

### 3.2 Alur Operator / Admin PDAM

1. Operator/Admin login ke Dashboard melalui Keycloak (SSO).
2. Operator melihat daftar tiket masuk beserta antrian dan prioritas.
3. Operator memverifikasi permintaan (cek data pelanggan & validitas keluhan).
4. Operator menjadwalkan armada dan memperbarui status (mis. **DIJADWALKAN → DALAM PERJALANAN → SELESAI**).
5. Setiap perubahan status memicu **notifikasi email** otomatis ke warga.
6. Operator Read-only (mis. Direksi) memantau volume, antrian, dan laporan tanpa mengubah data.
7. **Admin** mengkonfigurasi OTP email (aktif/nonaktif, masa berlaku, panjang kode, maksimum percobaan) dan template email.

### 3.3 Status Lifecycle Tiket

| Status | Makna | Pemicu Notifikasi Email |
|----|----|----|
| DITERIMA | Permintaan masuk & lolos validasi awal. | Ya — kirim nomor tiket |
| TERVERIFIKASI | Operator memverifikasi keabsahan permintaan. | Ya |
| DIJADWALKAN | Armada & jadwal pengiriman ditetapkan. | Ya |
| DALAM PERJALANAN | Mobil tangki dalam perjalanan ke lokasi. | Ya |
| SELESAI | Layanan selesai dilakukan. | Ya |
| DITOLAK / DIBATALKAN | Permintaan ditolak (mis. fiktif) atau dibatalkan. | Ya — disertai alasan |

---

## 4. Kebutuhan Fungsional

Setiap kebutuhan diberi kode (FR-xx) untuk keperluan *traceability* ke pengujian dan pengembangan.

### 4.1 Modul Permintaan Layanan (Pelanggan)

| Kode | Kebutuhan | Prioritas |
|----|----|----|
| FR-01 | Sistem menyediakan form input: Nomor Pelanggan (9 digit), Nomor HP, Email, dan Keluhan. | Must |
| FR-02 | Sistem memvalidasi Nomor Pelanggan terhadap master data pelanggan secara real-time. | Must |
| FR-03 | Bila nomor valid, Nama & Alamat di-auto-fill dari master data (read-only, tidak diinput warga). | Must |
| FR-04 | Bila nomor tidak ditemukan, sistem menolak submit dan menampilkan pesan yang jelas. | Must |
| FR-05 | Nomor HP wajib diisi dan divalidasi format (mis. format nomor Indonesia). | Must |
| FR-06 | Email wajib diisi bila OTP email aktif; bila OTP nonaktif, email opsional namun dianjurkan untuk notifikasi. | Must |
| FR-07 | Sistem membuat tiket dengan nomor unik dan menyimpan timestamp permintaan. | Must |

### 4.2 Modul Verifikasi & Anti-Fraud

| Kode | Kebutuhan | Prioritas |
|----|----|----|
| FR-08 | Sistem menerapkan **rate limiting** per Nomor Pelanggan dan/atau IP untuk mencegah spam/bot. | Must |
| FR-09 | Sistem mendukung **OTP via email** sebagai lapisan verifikasi sebelum submit. | Must |
| FR-10 | **Admin PDAM** dapat mengaktifkan/menonaktifkan OTP email serta mengatur masa berlaku, panjang kode, dan maksimum percobaan. | Must |
| FR-11 | Tiket dari nomor yang tidak ada di master data otomatis ditolak/di-flag sebagai fiktif. | Must |
| FR-12 | Sistem mencegah duplikasi tiket aktif untuk Nomor Pelanggan yang sama dalam rentang waktu tertentu. | Should |
| FR-13 | (Opsional, fase berikut) Notifikasi & OTP via WhatsApp/SMS sebagai kanal tambahan. | Could |

> **Keputusan Desain — Verifikasi**
> - Verifikasi utama mengandalkan validasi Nomor Pelanggan terhadap master data (efektif menyaring non-pelanggan).
> - **Rate limiting** menjadi mekanisme anti-bot/spam utama (tanpa arithmetic challenge).
> - **OTP via email** menambah lapisan verifikasi tanpa biaya SMS, dan dapat dinyalakan/dimatikan oleh admin sesuai kebutuhan tingkat keamanan.
> - WhatsApp/SMS disiapkan sebagai opsi upgrade pada fase berikutnya.

### 4.3 Modul Tracking Antrian (Publik)

| Kode | Kebutuhan | Prioritas |
|----|----|----|
| FR-14 | Warga dapat memasukkan **No. Pelanggan + No. HP** pada halaman publik untuk melihat status terkini. | Must |
| FR-15 | Halaman tracking menampilkan posisi antrian (urutan ke berapa) — analog modul antrian JKN. | Must |
| FR-16 | Halaman tracking menampilkan riwayat progres status beserta waktunya (status timeline). | Should |
| FR-17 | Tautan tracking dapat diakses langsung melalui email yang dikirim sistem. | Should |

### 4.4 Modul Notifikasi (Email)

| Kode | Kebutuhan | Prioritas |
|----|----|----|
| FR-18 | Saat tiket dibuat, sistem mengirim **Nomor Tiket + tautan tracking** via email. | Must |
| FR-19 | Setiap perubahan status memicu notifikasi progres ke email. | Must |
| FR-20 | Sistem mengirim kode OTP via email saat verifikasi diaktifkan. | Must |
| FR-21 | Sistem mencatat log pengiriman notifikasi (status terkirim/gagal) untuk audit. | Should |
| FR-22 | Template email (OTP, tiket, update status) dapat dikonfigurasi admin (teks dengan placeholder dinamis). | Should |

### 4.5 Modul Dashboard Operator

| Kode | Kebutuhan | Prioritas |
|----|----|----|
| FR-23 | Operator (CRUD) dapat melihat daftar tiket dengan filter status, tanggal, dan pencarian. | Must |
| FR-24 | Operator (CRUD) dapat mengubah status tiket dan menambahkan catatan/keterangan. | Must |
| FR-25 | Operator (CRUD) dapat menolak/membatalkan tiket disertai alasan. | Must |
| FR-26 | Operator (Read-only) dapat melihat seluruh tiket & laporan tanpa hak ubah. | Must |
| FR-27 | Dashboard menampilkan ringkasan: jumlah tiket per status dan antrian aktif. | Should |
| FR-28 | Tersedia ekspor data tiket (mis. Excel/CSV) untuk pelaporan. | Could |

### 4.6 Modul Konfigurasi Admin

| Kode | Kebutuhan | Prioritas |
|----|----|----|
| FR-29 | Admin dapat mengaktifkan/menonaktifkan OTP email melalui panel konfigurasi. | Must |
| FR-30 | Admin dapat mengatur parameter OTP: masa berlaku (mis. 5 menit), panjang kode (mis. 6 digit), maksimum percobaan. | Must |
| FR-31 | Admin dapat mengatur parameter rate limiting (mis. jumlah maksimum submit per No. Pelanggan/IP per jam). | Should |
| FR-32 | Admin dapat mengelola template email (OTP, tiket dibuat, update status). | Should |

### 4.7 Manajemen Pengguna & Role

| Kode | Kebutuhan | Prioritas |
|----|----|----|
| FR-33 | Akun operator/admin dikelola di Keycloak; aplikasi memetakan *realm role* ke hak akses. | Must |
| FR-34 | Sistem mendukung minimal tiga role: `tanki-operator-crud`, `tanki-operator-readonly`, dan `tanki-admin` (realm `DIAMOND`). | Must |
| FR-35 | Aksi penting (ubah status, tolak tiket, ubah konfigurasi) tercatat dalam audit log beserta identitas operator/admin. | Should |

### 4.8 Modul Dashboard (Ringkasan)

| Kode | Kebutuhan | Prioritas |
|----|----|----|
| FR-36 | Dashboard menampilkan *stat card* berisi jumlah tiket per status (DITERIMA, TERVERIFIKASI, DIJADWALKAN, DALAM PERJALANAN, SELESAI, DITOLAK/DIBATALKAN). | Must |
| FR-37 | Setiap *stat card* tertaut ke daftar tiket yang sudah terfilter sesuai status terkait. | Should |
| FR-38 | Dashboard menampilkan ringkasan antrian aktif beserta status armada (jumlah kendaraan tersedia vs bertugas). | Should |

### 4.9 Modul Dispatch / Armada

| Kode | Kebutuhan | Prioritas |
|----|----|----|
| FR-39 | Operator dapat mengelola master kendaraan (mobil tangki) secara CRUD. | Must |
| FR-40 | Operator dapat mengelola master sopir secara CRUD. | Must |
| FR-41 | Operator dapat membuat penugasan (*assignment/dispatch*) = menetapkan kendaraan + sopir + jadwal ke sebuah tiket. | Must |
| FR-42 | Sistem mencegah *double-booking* — satu armada/sopir hanya boleh memiliki satu penugasan aktif pada satu waktu — melalui *constraint* di tingkat database. | Must |
| FR-43 | Membuat penugasan secara otomatis mengubah status tiket menjadi **DIJADWALKAN**, menulis entri pada `tiket_riwayat`, dan memicu notifikasi email ke warga. | Must |
| FR-44 | Status armada dapat bernilai TERSEDIA / BERTUGAS / PERBAIKAN / NONAKTIF. | Should |

> **Catatan — Dokumen Operasional (fase berikut)**
> Dokumen operasional **"SPK Air Tangki"** (Surat Perintah Kerja) & **"Berita Acara Air Tangki"** — mengikuti istilah PDAM sebagaimana dipakai pada billing-pdam — direncanakan pada fase berikutnya dan berada **di luar lingkup scaffold** fase ini.

### 4.10 Modul Laporan

| Kode | Kebutuhan | Prioritas |
|----|----|----|
| FR-45 | Tersedia panel filter *opt-in* (checkbox per kolom: status, periode/rentang tanggal, wilayah, rayon) untuk menyusun laporan. | Should |
| FR-46 | Laporan dapat diekspor ke Excel/CSV. | Could |
| FR-47 | Akses laporan dibatasi oleh permission `report:view` (melihat) dan `report:export` (mengekspor). | Should |

> **Catatan (asumsi):** Dimensi laporan terbatas pada **wilayah (`wil`)** + **rayon (`koderayon`)** karena master pelanggan tidak memuat cabang/golongan/kelurahan/tarif.

### 4.11 Modul Pencarian Permintaan

| Kode | Kebutuhan | Prioritas |
|----|----|----|
| FR-48 | Operator dapat mencari tiket berdasarkan no_tiket / no_pelanggan / no_hp / status / rentang tanggal, dilengkapi panel filter *opt-in*. | Must |

### 4.12 Modul Pencarian Pelanggan

| Kode | Kebutuhan | Prioritas |
|----|----|----|
| FR-49 | Operator dapat mencari master pelanggan (read-only) berdasarkan nosamb / nama / alamat / wilayah / rayon, untuk verifikasi & membantu input. | Must |

---

## 5. Autentikasi & Otorisasi (Keycloak)

Seluruh akses operator/admin diamankan melalui **Keycloak** sebagai Identity & Access Management (IAM) terpusat, menggunakan protokol **OpenID Connect (OIDC)**. Pendekatan ini memudahkan SSO, pengelolaan akun terpusat, dan penegakan kebijakan keamanan (password policy, MFA) tanpa membangun modul auth sendiri.

### 5.1 Arsitektur SSO

- **Instance (reuse):** Keycloak terpusat PDAM Makassar — `https://diamond.pdammakassar.co.id/auth` (sama dengan pdam-hrms; lihat [Bagian 11.5](#115-temuan-keycloak--rekomendasi)).
- **Realm:** `DIAMOND` — realm bersama lintas aplikasi PDAM (pola **1 realm, banyak client**).
- **Client:** daftarkan client OIDC baru **`tanki-jene`** pada realm `DIAMOND` (public client, Authorization Code + PKCE).
- **Flow:** Authorization Code Flow + **PKCE (S256)**, `onLoad: check-sso` + silent SSO (selaras implementasi pdam-hrms). Integrasi pada Next.js dapat menggunakan Auth.js (NextAuth) provider Keycloak atau library OIDC; *Route Handlers* / Server Actions memvalidasi access token (JWT) pada setiap request terproteksi.
- **Token:** access token berisi *realm role*; back-end melakukan otorisasi berdasarkan klaim role di token. Custom claim (bila perlu) ditambahkan via protocol mapper, mengikuti pola `keycloak_setup_hr_client.sh` di pdam-hrms.

### 5.2 Pemetaan Role (Role Mapping)

Mengikuti konvensi penamaan realm role pdam-hrms (`app-hr`, `hr-*`), Tanki Je'ne' menambah realm role baru pada realm `DIAMOND` dengan prefiks `tanki`:

| Realm Role (Keycloak) | Hak Akses di Tanki Je'ne' |
|----|----|
| `app-tanki` | Role dasar — penanda pengguna berhak mengakses aplikasi Tanki Je'ne' (syarat masuk ke seluruh modul operator). |
| `tanki-operator-crud` | Akses penuh dashboard: kelola & ubah status tiket, tolak/batalkan, kelola data layanan, **dispatch/armada CRUD**, dan **ekspor laporan**. |
| `tanki-operator-readonly` | Akses baca: lihat dashboard, tiket, antrian, dan laporan (view) saja. Tidak dapat mengubah data maupun mengekspor. |
| `tanki-admin` | Seluruh hak `tanki-operator-crud` + konfigurasi sistem (OTP email, rate limiting, template email). |

**Pemetaan permission modul ke role:**

| Permission / Modul | `app-tanki` | `tanki-operator-readonly` | `tanki-operator-crud` | `tanki-admin` |
|----|:--:|:--:|:--:|:--:|
| Masuk aplikasi (base) | ✅ | ✅ | ✅ | ✅ |
| Dashboard (view) | — | ✅ | ✅ | ✅ |
| Laporan `report:view` | — | ✅ | ✅ | ✅ |
| Laporan `report:export` | — | — | ✅ | ✅ |
| Dispatch / Armada (CRUD) | — | — | ✅ | ✅ |
| Konfigurasi sistem | — | — | — | ✅ |

> **Catatan:** `app-tanki` adalah role dasar untuk masuk aplikasi; `tanki-operator-readonly` hanya memperoleh akses dashboard + laporan (view). Permission **dispatch CRUD**, **konfigurasi**, dan **`report:export`** dibatasi pada `tanki-operator-crud` / `tanki-admin` (konfigurasi khusus `tanki-admin`).

### 5.3 Alur Login Operator

1. Operator mengakses Dashboard Tanki Je'ne'; aplikasi me-redirect ke halaman login Keycloak.
2. Operator memasukkan kredensial (dan MFA bila diaktifkan) pada Keycloak.
3. Keycloak mengembalikan authorization code; aplikasi menukarnya menjadi access & refresh token.
4. Back-end memvalidasi token (signature, issuer, audience, expiry) dan membaca realm role.
5. UI dan endpoint menyesuaikan kemampuan berdasarkan role (CRUD / Read-only / Admin).

### 5.4 Pemisahan Akses Publik vs Operator

> **Penting**
> - Portal warga sepenuhnya publik — tidak melalui Keycloak dan tidak memerlukan akun.
> - Hanya rute `/dashboard` (operator/admin) yang memerlukan token Keycloak yang valid.
> - Endpoint API operator menolak request tanpa token atau dengan role yang tidak sesuai (HTTP 401/403).

### 5.5 Stack Autentikasi (Auth.js + Keycloak)

Aplikasi memakai **Auth.js (NextAuth v5)** dengan provider **Keycloak** sebagai layer integrasi OIDC pada Next.js — **menggantikan better-auth bawaan template** NextAdmin (lihat [Bagian 7.5](#75-template-ui--theming)).

- **Tipe client:** Client `tanki-jene` didaftarkan sebagai **confidential client** pada realm `DIAMOND`. Auth.js menukar *authorization code* di sisi server (server-side, dengan *client secret*); **PKCE (S256) tetap aktif**. Ini **menyempurnakan catatan di [Bagian 5.1](#51-arsitektur-sso)** yang sebelumnya menyebut *public client*.
- **Pembacaan role:** *Realm roles* dibaca dari **access_token** pada klaim `realm_access.roles`; otorisasi server-side memetakan role tersebut ke permission modul (lihat [Bagian 5.2](#52-pemetaan-role-role-mapping)).
- **Caveat kompatibilitas:** Kombinasi **Next.js 16 / Auth.js v5 (beta)** masih berstatus *beta* — perlu diverifikasi kompatibilitasnya (versi pinning, breaking change) sebelum produksi.

---

## 6. Kebutuhan Non-Fungsional

| Aspek | Kebutuhan |
|----|----|
| Aksesibilitas | Web responsive; dapat diakses dari browser Android, iOS, dan desktop tanpa instalasi. |
| Performa | Halaman publik (form & tracking) ter-load < 3 detik pada koneksi seluler umum. |
| Keamanan | HTTPS wajib; proteksi terhadap injection & abuse; **rate limiting** + **OTP email**; operator via Keycloak (OIDC). |
| Privasi Data | Auto-fill hanya menampilkan data yang diperlukan; *tracking* memerlukan kecocokan No. Pelanggan + No. HP agar tidak mengekspos data pelanggan lain. |
| Ketersediaan | Target uptime tinggi pada jam layanan; desain mendukung pengembangan menuju HA. |
| Auditability | Aksi operator/admin dan pengiriman notifikasi tercatat untuk penelusuran. |
| Skalabilitas | Arsitektur Next.js monolith modular yang dapat di-scale (horizontal) dan dipecah bila volume tumbuh. |
| Lokalisasi | Antarmuka Bahasa Indonesia; istilah teknis dipertahankan dalam English. |

---

## 7. Arsitektur Teknis & Integrasi

### 7.1 Komponen Sistem

| Komponen | Teknologi | Peran |
|----|----|----|
| Front-end | **Next.js** (React, App Router) — web responsive | Portal publik warga + dashboard operator/admin. |
| Back-end | **Next.js** Route Handlers / Server Actions (monolith) | Logika bisnis, validasi, OTP, orkestrasi notifikasi. |
| Database | **MySQL** | Master data pelanggan + data transaksi tiket, OTP, konfigurasi, log. |
| Auth / IAM | **Keycloak (OIDC)** — reuse instance terpusat `DIAMOND` | Authentication & authorization operator/admin. |
| Notifikasi | **Email (SMTP / email transaksional)** | Kirim OTP, nomor tiket, & update progres ke warga. |
| Rate Limiting | Middleware Next.js (penyimpanan counter di MySQL atau in-memory store) | Membatasi spam/bot per No. Pelanggan/IP. |

**Catatan:** Stack difinalkan sebagai **Next.js + MySQL** dengan **Keycloak** sebagai IAM. Untuk *showcase* MVP, rate limiting dapat diimplementasikan via middleware (in-memory atau tabel counter di MySQL); bila volume tumbuh, dapat dimigrasikan ke store khusus (mis. Redis).

### 7.2 Integrasi Master Data Pelanggan

- Master data pelanggan disediakan melalui dump database PDAM (struktur 2022 masih kompatibel — lihat `pelanggan.sql`).
- Data pelanggan bersifat **read-only** bagi Tanki Je'ne'; hanya digunakan untuk validasi & auto-fill.
- Disarankan menyepakati mekanisme pemutakhiran data (one-time dump vs sync berkala) agar pelanggan baru terjangkau.

### 7.3 Integrasi Email

- Pengiriman email via SMTP / penyedia email transaksional.
- **Email OTP** memuat: kode OTP, masa berlaku, dan peringatan keamanan.
- **Email submit** memuat: nomor tiket, ringkasan permintaan, dan tautan tracking.
- **Email update** memuat: perubahan status dan informasi lanjutan bila ada (mis. alasan penolakan).
- Seluruh pengiriman dicatat pada `notifikasi_log` untuk audit.

### 7.4 Konfigurasi OTP (Admin)

- Parameter OTP (aktif/nonaktif, masa berlaku, panjang kode, maksimum percobaan) disimpan di MySQL dan dikelola oleh role `tanki-admin`.
- Bila OTP nonaktif, alur submit melewati langkah verifikasi OTP namun tetap dilindungi rate limiting dan validasi master data.

### 7.5 Template UI & Theming

- Aplikasi mengadopsi template **NextAdmin** (`github.com/NextAdminHQ/nextjs-admin-dashboard`) secara **penuh** (*fork & adapt*) sebagai dasar UI dashboard operator/admin.
- Berbasis **Next.js App Router + Tailwind v4** (menggunakan `@theme`); variabel `--color-primary` di-*rebrand* ke warna PDAM.
- Layer auth bawaan template (better-auth) digantikan **Auth.js + Keycloak** (lihat [Bagian 5.5](#55-stack-autentikasi-authjs--keycloak)).

> **⚠️ Catatan lisensi:** Repo *free* NextAdmin **tidak menyertakan file LICENSE** meskipun README menyebutnya *open-source*. Hak pakai untuk aplikasi pemerintah **perlu dikonfirmasi** sebelum produksi.

---

## 8. Skema Data (Konseptual)

Skema berikut bersifat konseptual untuk menyamakan pemahaman; detail kolom & tipe data difinalkan pada fase desain teknis.

### Tabel `pelanggan` (master, dari dump — read-only, skema final)

Skema final hasil telaah dump database PDAM (charset **utf8mb4**, ± **231.001 baris**, **read-only** bagi Tanki Je'ne'):

| Kolom | Tipe | Keterangan |
|----|----|----|
| nosamb | CHAR(9), PK | Nomor sambungan/pelanggan 9 digit (kunci validasi & auto-fill). |
| nama | VARCHAR(150) | Nama pelanggan (untuk auto-fill). |
| alamat | VARCHAR(255) | Alamat pelanggan (untuk auto-fill). |
| koderayon | VARCHAR(7) | Kode rayon (dimensi laporan). |
| wil | CHAR(2) | Kode wilayah (dimensi laporan). |

> **Penting:** Master pelanggan **TIDAK memuat** No. HP, email, cabang, golongan, maupun tarif. Konsekuensinya dicatat pada [Bagian 9](#9-asumsi-batasan--risiko) (phone-gap, OTP email, dan keterbatasan dimensi laporan).

### Tabel `tiket` (transaksi)

| Kolom | Tipe | Keterangan |
|----|----|----|
| id | BIGINT, PK | Primary key internal. |
| no_tiket | VARCHAR, UNIQUE | Nomor tiket yang ditampilkan ke warga. |
| no_pelanggan | CHAR(9), FK | Mengacu ke master pelanggan (`nosamb`). |
| nama_snapshot | VARCHAR(150) | Salinan nama pelanggan saat submit (snapshot dari master). |
| alamat_snapshot | VARCHAR(255) | Salinan alamat pelanggan saat submit (snapshot dari master). |
| wil | CHAR(2) | Salinan kode wilayah saat submit (dimensi laporan). |
| koderayon | VARCHAR(7) | Salinan kode rayon saat submit (dimensi laporan). |
| no_hp | VARCHAR | Nomor HP kontak (wajib) — kunci pencarian tracking. |
| email | VARCHAR, NULL | Email untuk OTP & notifikasi (wajib bila OTP aktif). |
| keluhan | TEXT | Keterangan/keluhan permintaan. |
| status | ENUM | DITERIMA / TERVERIFIKASI / DIJADWALKAN / DALAM PERJALANAN / SELESAI / DITOLAK. |
| created_at | DATETIME | Waktu permintaan dibuat. |

> **Catatan snapshot:** `nama_snapshot`, `alamat_snapshot`, `wil`, dan `koderayon` **disalin dari master saat submit** agar laporan/join tidak bergantung pada master pelanggan yang dapat berubah dari waktu ke waktu.

### Tabel `tiket_riwayat` (status timeline)

- `id`, `tiket_id` (FK), `status`, `catatan`, `operator_id`, `created_at` — untuk menampilkan progres & audit.

### Tabel `otp_verifikasi`

- `id`, `no_pelanggan`, `email`, `kode_otp` (hash), `expired_at`, `attempts`, `status` (PENDING/VERIFIED/EXPIRED), `created_at` — untuk verifikasi OTP email.

### Tabel `konfigurasi`

- `key`, `value`, `updated_by`, `updated_at` — menyimpan parameter sistem (OTP aktif/nonaktif, masa berlaku, panjang kode, parameter rate limiting, template email).

### Tabel `notifikasi_log`

- `id`, `tiket_id` (FK, NULL untuk OTP), `channel` (email), `jenis` (OTP/TIKET/UPDATE), `status_kirim` (terkirim/gagal), `created_at` — untuk audit pengiriman.

### Tabel `kendaraan` (mobil tangki)

| Kolom | Tipe | Keterangan |
|----|----|----|
| id | BIGINT, PK | Primary key internal. |
| nopol | VARCHAR, UNIQUE | Nomor polisi kendaraan. |
| merk | VARCHAR | Merk/tipe kendaraan. |
| kapasitas_liter | INT | Kapasitas tangki (liter). |
| status | ENUM | TERSEDIA / BERTUGAS / PERBAIKAN / NONAKTIF. |
| aktif | BOOLEAN | Penanda data aktif (soft delete). |
| created_at | DATETIME | Waktu data dibuat. |
| updated_at | DATETIME | Waktu data diperbarui. |

### Tabel `sopir`

| Kolom | Tipe | Keterangan |
|----|----|----|
| id | BIGINT, PK | Primary key internal. |
| nama | VARCHAR | Nama sopir. |
| nik | VARCHAR, UNIQUE, NULL | NIK sopir (opsional, unik bila diisi). |
| no_hp | VARCHAR | Nomor HP sopir. |
| status | ENUM | TERSEDIA / BERTUGAS / CUTI / NONAKTIF. |
| aktif | BOOLEAN | Penanda data aktif (soft delete). |
| created_at | DATETIME | Waktu data dibuat. |
| updated_at | DATETIME | Waktu data diperbarui. |

### Tabel `penugasan` (assignment / dispatch)

| Kolom | Tipe | Keterangan |
|----|----|----|
| id | BIGINT, PK | Primary key internal. |
| tiket_id | BIGINT, FK | Mengacu ke `tiket`. |
| kendaraan_id | BIGINT, FK | Mengacu ke `kendaraan`. |
| sopir_id | BIGINT, FK | Mengacu ke `sopir`. |
| jadwal_mulai | DATETIME | Waktu mulai penugasan. |
| jadwal_selesai | DATETIME, NULL | Waktu selesai penugasan (bila ada). |
| status | ENUM | DIJADWALKAN / BERANGKAT / SELESAI / DIBATALKAN. |
| assigned_by | VARCHAR | Identitas operator yang membuat penugasan. |
| created_at | DATETIME | Waktu data dibuat. |
| updated_at | DATETIME | Waktu data diperbarui. |

> **Catatan anti double-booking:** Pencegahan *double-booking* diterapkan lewat **generated column + UNIQUE key** di MySQL (memastikan satu penugasan aktif per kendaraan/sopir/tiket). **Overlap jadwal** secara penuh divalidasi di **level aplikasi** (lihat FR-42).

---

## 9. Asumsi, Batasan & Risiko

### 9.1 Asumsi

- PDAM menyediakan dump master data pelanggan yang dapat diakses untuk validasi.
- PDAM menyediakan/menyetujui akun email pengirim (SMTP / email transaksional).
- Instance Keycloak untuk pengelolaan akun operator/admin **sudah tersedia & di-reuse**: instance terpusat `DIAMOND` (`https://diamond.pdammakassar.co.id/auth`) yang dipakai pdam-hrms & pdam-hubungan-pelanggan. Tanki Je'ne' cukup menambah client `tanki-jene` (lihat [Bagian 11.5](#115-temuan-keycloak--rekomendasi)). *(Catatan: billing-pdam TIDAK memakai Keycloak — auth-nya JWT custom — jadi bukan sumber reuse untuk IAM.)*
- **Phone-gap:** Master pelanggan **tidak memiliki No. HP**; No. HP diisi oleh warga saat mengajukan permintaan dan **divalidasi FORMAT saja** (tidak dicocokkan ke master). *Tracking* publik memakai No. HP yang tersimpan di tiket.
- **OTP via email** membutuhkan **email yang diisi warga** karena master pelanggan **tidak menyimpan email**. Bila OTP aktif, warga tanpa email tidak dapat menyelesaikan verifikasi.
- **Dimensi laporan terbatas** pada **wilayah (`wil`) + rayon (`koderayon`)** karena master pelanggan tidak memuat cabang/golongan/kelurahan/tarif (lihat [Bagian 4.10](#410-modul-laporan)).

### 9.2 Batasan

- Fase ini berfokus pada modul Mobil Tangki; integrasi billing dan tracking GPS belum termasuk.
- Verifikasi warga mengandalkan validasi nomor pelanggan + rate limiting + OTP email (tanpa WhatsApp/SMS).
- Kanal notifikasi pada fase ini hanya **email**.

### 9.3 Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|----|----|----|
| Master data pelanggan usang | Pelanggan baru gagal validasi | Sepakati mekanisme update/sync data pelanggan. |
| Permintaan fiktif lolos verifikasi | Beban operasional armada | Validasi nomor + rate limiting + OTP email (bila aktif) + verifikasi operator. |
| Email gagal terkirim | Warga tidak menerima OTP/tiket | Tampilkan nomor tiket di layar + sediakan *tracking* via No. Pelanggan + No. HP + log notifikasi. |
| Warga tidak memiliki email saat OTP aktif | Tidak bisa submit | Admin dapat menonaktifkan OTP; pertimbangkan kebijakan/edukasi atau fase WhatsApp/SMS. |
| Ketergantungan Keycloak | Operator tak bisa login | Pastikan ketersediaan IAM; prosedur pemulihan akun. |
| Penambahan client `tanki-jene` & realm role `tanki-*` di realm bersama `DIAMOND` | Konflik/penolakan perubahan pada realm bersama | Koordinasi dengan admin Keycloak PDAM (pemilik pdam-hrms) sebelum mendaftarkan client & role baru. |

---

## 10. Rencana Pengembangan (Phasing)

| Fase | Cakupan | Tujuan |
|----|----|----|
| **Fase 0 — PRD + Scaffold** | Aplikasi *runnable* dari template NextAdmin, login Keycloak (Auth.js) berfungsi, dashboard kosong, data model + skeleton modul (tiket, dispatch/armada, laporan, pencarian) siap. | Fondasi teknis & kesepakatan ruang lingkup sebelum MVP. |
| **Fase 1 — MVP** | Form permintaan + validasi nomor + rate limiting + OTP email (konfigurabel) + tiket + notifikasi email + tracking publik (No. Pelanggan + No. HP) + dashboard operator/admin (Keycloak). | Showcase end-to-end untuk Direksi PDAM. |
| **Fase 2** | Laporan & ekspor, template notifikasi konfigurabel lanjutan, audit log lengkap. | Operasional & pelaporan. |
| **Fase 3** | Kanal WhatsApp/SMS (notifikasi & OTP), penjadwalan armada, integrasi modul lain (billing/GIS). | Perluasan layanan. |

> **Langkah Selanjutnya**
> - Review PRD ini bersama tim & stakeholder PDAM.
> - Konfirmasi sumber & mekanisme pemutakhiran master data pelanggan (`pelanggan.sql`).
> - Konfirmasi penyedia email (SMTP / email transaksional) dan ketersediaan instance Keycloak.
> - Lanjut ke desain teknis (skema final, kontrak API/Route Handlers Next.js, wireframe) menuju MVP.

---

## 11. Infrastruktur, VPS & Deployment (Selaras dengan billing-pdam)

Bagian ini menyelaraskan VPS dan Keycloak **Tanki Je'ne'** dengan proyek **billing-pdam** (`../billing-pdam/`), berdasarkan telaah dokumen `DOKUMENTASI_SISTEM_BILLING_PDAM.md` dan `WEBAPP_REVAMP_SPECIFICATION.md`.

> **⚠️ Temuan Utama (hasil telaah `../billing-pdam/`)**
> - Repo billing-pdam saat ini berupa **dokumentasi/spesifikasi** — belum ada file `docker-compose.yml`/`.env` aktual; seluruh konfigurasi deployment ditulis *inline* di dalam dokumen markdown.
> - **Tidak ditemukan Keycloak** di seluruh repo billing-pdam. Autentikasi billing-pdam memakai **JWT custom (NestJS)**, **bukan** Keycloak/SSO. Artinya **tidak ada instance Keycloak existing yang bisa langsung di-reuse** untuk Tanki Je'ne'.
> - Yang dapat diselaraskan/di-reuse adalah **pola VPS / Docker host, NGINX reverse proxy + TLS, skema domain, CI/CD, dan SMTP** — bukan layer autentikasi.

### 11.1 Model VPS / Docker Host (reuse dari billing-pdam)

billing-pdam dideploy sebagai *single Docker host* (VPS) menjalankan `docker-compose` pada path `/opt/pdam-billing`, dengan jaringan bridge `pdam-net`. Pola yang sama diadopsi untuk Tanki Je'ne'.

| Layanan (billing-pdam) | Port | Peran | Padanan untuk Tanki Je'ne' |
|----|----|----|----|
| nginx | 80 / 443 | Reverse proxy + TLS | **Reuse** (tambah virtual host untuk Tanki Je'ne') |
| frontend (React) | 3000 | UI | Diganti **Next.js** (front-end + back-end menyatu) |
| backend (NestJS) | 4000 | API | Diganti **Next.js** Route Handlers / Server Actions |
| postgresql | 5432 | Database billing | Tanki Je'ne' pakai **MySQL** (container terpisah) |
| redis | 6379 | Cache/session | Opsional untuk rate limiting (fase lanjut) |
| minio | 9000 / 9001 | Object storage | Tidak dipakai pada MVP Tanki Je'ne' |

- **Deploy path usulan:** `/opt/tanki-jene` (mengikuti konvensi `/opt/pdam-billing`).
- **Jaringan:** dapat berbagi host yang sama; gunakan network terpisah (mis. `tanki-net`) atau `pdam-net` yang sama bila ingin berbagi service.

### 11.2 Reverse Proxy, Domain & TLS

- **NGINX** sebagai reverse proxy/load balancer pada port `80/443`, sertifikat TLS pada volume `nginx_certs` (`./nginx/certs`). **Reuse** instance NGINX yang sama.
- **Skema domain billing-pdam:** `billing.pdam-makassar.go.id` (app) dan `api.billing.pdam-makassar.go.id` (API).
- **Usulan domain Tanki Je'ne':** `tangki.pdam-makassar.go.id` (portal publik + dashboard). Bila Keycloak baru di-deploy: `sso.pdam-makassar.go.id`.

### 11.3 CI/CD (pola sama dengan billing-pdam)

- **GitLab CI** → build image → push ke `registry.gitlab.com` → deploy via **SSH** ke `$DEPLOY_HOST` → `docker-compose pull && docker-compose up -d --remove-orphans`.
- Trigger pada branch `main`, environment `production`.
- Adopsi pola yang sama untuk Tanki Je'ne' dengan registry/path image tersendiri.

### 11.4 Email / SMTP (reuse)

- billing-pdam: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `EMAIL_FROM=noreply@pdam-makassar.go.id`.
- **Reuse** konfigurasi SMTP & alamat pengirim yang sama untuk OTP, tiket, dan update progres Tanki Je'ne' (lihat [Bagian 7.3](#73-integrasi-email)).

### 11.5 Temuan Keycloak & Rekomendasi

Telaah dua proyek PDAM memberi hasil berbeda:

| Proyek | Keycloak? | Detail |
|----|----|----|
| **billing-pdam** | ❌ Tidak | Auth memakai **JWT custom (NestJS)** — access 15m / refresh 7d (httpOnly), bcrypt(12), lockout 5x/30m. Bukan sumber reuse IAM. |
| **pdam-hrms** | ✅ **Ya** | Keycloak terpusat **production** — instance & realm dipakai bersama lintas aplikasi PDAM. |
| pdam-hubungan-pelanggan | ✅ Ya | Memakai instance/realm yang sama (file `keycloak.ts` pdam-hrms disalin dari proyek ini). |

**Instance Keycloak terpusat (dari pdam-hrms) — inilah yang di-reuse:**

| Item | Nilai |
|----|----|
| URL | `https://diamond.pdammakassar.co.id/auth` |
| Realm | `DIAMOND` (bersama lintas aplikasi) |
| Pola | **1 realm, banyak client** — `pdam-hrms`, `pdam-hubungan-pelanggan`, dst. |
| Flow | Authorization Code + **PKCE (S256)**, `check-sso` + silent SSO, auto-refresh token |
| Realm roles (HR) | `app-hr` (base), `hr-super-admin`, `hr-admin`, `hr-pajak-admin`, `hr-manager` |
| Custom claims | protocol mapper via script `db/keycloak_setup_hr_client.sh` |
| Klien | Web `keycloak-js` v25; Mobile `flutter_appauth` |
| Host bersama | `diamond.pdammakassar.co.id` → `/auth` (Keycloak), `/api-hrms` (Hasura), `/hr-actions` |

**Rekomendasi (Direkomendasikan):** **Reuse instance & realm `DIAMOND` yang sudah ada** — tidak perlu deploy Keycloak baru.

1. Daftarkan client OIDC baru **`tanki-jene`** pada realm `DIAMOND` (public client, redirect URI `https://tangki.pdam-makassar.go.id/*`).
2. Tambahkan realm role baru berprefiks `tanki` mengikuti konvensi `app-hr`/`hr-*`: `app-tanki` (base), `tanki-operator-crud`, `tanki-operator-readonly`, `tanki-admin` (lihat [Bagian 5.2](#52-pemetaan-role-role-mapping)).
3. Integrasikan dari Next.js via Auth.js (provider Keycloak) atau library OIDC; pakai PKCE (S256) selaras pola pdam-hrms.
4. Bila perlu custom claim, buat protocol mapper meniru `keycloak_setup_hr_client.sh`.

> **Catatan koordinasi:** karena realm `DIAMOND` dipakai bersama, penambahan client & realm role `tanki-*` perlu dikoordinasikan dengan admin Keycloak PDAM (pemilik instance pdam-hrms). Domain `diamond.pdammakassar.co.id` (`.co.id`) berbeda dengan domain aplikasi yang diusulkan (`pdam-makassar.go.id`) — perlu disepakati domain final untuk portal Tanki Je'ne'.

### 11.6 Perbedaan Stack yang Perlu Diselaraskan

| Aspek | billing-pdam | Tanki Je'ne' | Catatan penyelarasan |
|----|----|----|----|
| Front-end | React | **Next.js** | Beda framework; UI dibangun ulang. |
| Back-end | NestJS (API terpisah) | **Next.js** (monolith) | Pola berbeda; tidak berbagi kode backend. |
| Database | PostgreSQL | **MySQL** | Container DB terpisah pada host yang sama. |
| Auth | JWT custom (billing-pdam) / Keycloak `DIAMOND` (pdam-hrms) | **Keycloak (OIDC) — reuse `DIAMOND`** | Reuse instance pdam-hrms, tambah client `tanki-jene`. Lihat [Bagian 11.5](#115-temuan-keycloak--rekomendasi). |
| Reverse proxy | NGINX + TLS | **NGINX (reuse)** | Tambah virtual host/domain. |
| CI/CD | GitLab CI + SSH deploy | **Sama** | Reuse pola, registry/path tersendiri. |
| Email/SMTP | smtp.gmail.com:587 | **Sama (reuse)** | Reuse pengirim `noreply@pdam-makassar.go.id`. |
| Cache/Storage | Redis + MinIO | Redis opsional, MinIO tidak dipakai (MVP) | Sesuaikan saat kebutuhan tumbuh. |
