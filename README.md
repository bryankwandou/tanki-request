# Tanki Je'ne' — PDAM Kota Makassar

Sistem Informasi Permintaan Layanan Mobil Tangki. Aplikasi web (Next.js + MySQL +
Keycloak) untuk warga mengajukan permintaan mobil tangki dan operator PDAM
mengelola verifikasi, dispatch armada, dan laporan.

PRD lengkap: [`PRD_TANKI_JENE.md`](./PRD_TANKI_JENE.md).

> Status: **Fungsional (Fase 0+)**. Sudah jalan & terverifikasi:
> - Portal publik: form permintaan (validasi master + snapshot + rate limiter + dedup), tracking `/lacak`.
> - Operator: dashboard agregat, pencarian pelanggan/permintaan, **detail tiket + ubah status** (verify/tolak/batal dgn alasan, role-gated).
> - **Dispatch penuh**: master kendaraan & sopir, penugasan (assign → tiket DIJADWALKAN) dgn **guard anti double-booking** + rilis armada saat selesai/batal.
> - **Notifikasi email** (tiket dibuat + setiap perubahan status) via SMTP yang dikonfigurasi admin; fallback log konsol bila SMTP kosong.
> - **OTP email pada alur submit publik**: kode di-hash SHA-256, TTL & panjang & maks. percobaan diatur admin, tiket baru dibuat **setelah** kode terverifikasi. Kirim ulang dibatasi dan tidak memulihkan jatah percobaan.
> - **Konfigurasi admin**: SMTP (host/port/secure/user/pass write-only/from), parameter OTP & rate-limit (di-clamp di sisi server), dan **template email** ketiga jenis notifikasi dengan placeholder, plus tombol "kirim email tes".
> - **Laporan** (FR-45..47): agregasi per status/wilayah/rayon atas rentang tanggal, filter, grafik, dan ekspor CSV + Excel.
>
> Belum: login Keycloak (instance VPS sedang down).

## Stack

| Lapisan | Teknologi |
|---|---|
| Frontend + Backend | Next.js 16 (App Router), React 19, Tailwind v4 (template NextAdmin, di-rebrand) |
| Database | MySQL 8 (via Docker), Prisma 7 (`@prisma/adapter-mariadb`) |
| Auth operator | Auth.js (NextAuth v5) + Keycloak (realm `DIAMOND`, client `tanki-jene`) |
| Notifikasi | Email (belum diimplementasikan di scaffold) |

## Prasyarat

- Node.js 22+ (lihat `.nvmrc`)
- Docker (untuk MySQL)

## Setup

```bash
# 1. Dependencies (template stack bleeding-edge → butuh legacy-peer-deps)
npm install --legacy-peer-deps

# 2. Database MySQL + import master pelanggan (~231k baris)
docker compose up -d
docker exec -i tanki-mysql mysql -uroot -prootpass tanki_jene < db/pelanggan_ddl.sql
( echo "SET autocommit=0; SET unique_checks=0; SET NAMES utf8mb4;"; \
  LC_ALL=C sed 's/<table_name>/pelanggan/g' pelanggan.sql; echo "COMMIT;" ) \
  | docker exec -i tanki-mysql mysql -uroot -prootpass tanki_jene

# 3. Buat tabel transaksi dari Prisma schema + guard anti double-booking
npx prisma generate
# Pada database yang SUDAH BERISI data, jalankan migrasi ini LEBIH DULU —
# lihat "Upgrade database yang sudah berisi data" di bawah.
npx prisma db push
docker exec -i tanki-mysql mysql -uroot -prootpass tanki_jene < db/penugasan_guard.sql

# 4. Env: salin .env.example → .env, lalu isi AUTH_SECRET & AUTH_KEYCLOAK_SECRET
cp .env.example .env
# openssl rand -base64 32   → AUTH_SECRET

# 5. Jalankan
npm run dev   # http://localhost:3000
```

## Upgrade database yang sudah berisi data

Pada database kosong, `npx prisma db push` cukup. Pada database yang **sudah
berisi baris `otp_verifikasi`**, ia akan berhenti:

```
Error: Added the required column `token` to the `otp_verifikasi` table
       without a default value. There are 3 rows in this table.
```

Perlu ditegaskan karena instruksi yang sempat beredar salah: `DELETE FROM
otp_verifikasi WHERE status = 'PENDING';` **tidak cukup**. Prisma menghitung
seluruh baris, bukan hanya yang PENDING — satu baris `VERIFIED` yang tersisa pun
tetap menghentikannya. Mengosongkan seluruh tabel memang membuat `db push`
jalan, tapi ikut membuang jejak audit dan memutus sesi OTP pelanggan yang sedang
berjalan saat deploy.

Jalankan migrasi non-destruktif ini **sebelum** `db push`:

```bash
docker exec -i tanki-mysql mysql -uroot -prootpass tanki_jene < db/migrasi_otp_lapis3.sql
npx prisma db push
```

Skrip itu menambah `token` (di-backfill acak per baris, lalu dijadikan UNIQUE
NOT NULL), `resend_count`, `last_sent_at`, dan `session_hash` — tanpa menghapus
satu baris pun. Aman diulang: setiap langkah memeriksa dirinya sendiri lebih
dulu, dan di akhir mencetak ringkasan jumlah baris serta token yang masih kosong.

## Dev lokal: Keycloak + Mailpit (login & email jalan tanpa VPS)

`docker compose up -d` sudah menjalankan **Keycloak** (`:8080`) dan **Mailpit** (`:8025`)
selain MySQL. Untuk menyiapkan realm + client + user uji:

```bash
docker compose up -d                    # mysql + keycloak + mailpit
node db/keycloak_local_setup.mjs        # buat realm DIAMOND, client tanki-jene, roles, user uji
# salin AUTH_KEYCLOAK_SECRET yang dicetak → .env  (issuer = http://localhost:8080/realms/DIAMOND)
```

- **Login uji**: buka `http://localhost:3000/dashboard` → diarahkan ke Keycloak lokal. Terdapat 4 akun matriks pengujian (kata sandi untuk seluruh akun: **`Operator123!`**):
  - **`operator`**: role `app-tanki`, `tanki-operator-crud`, `tanki-admin` (Akses penuh & konfigurasi SMTP).
  - **`operator-crud`**: role `app-tanki`, `tanki-operator-crud` (Kelola tiket, dispatch, armada).
  - **`operator-readonly`**: role `app-tanki`, `tanki-operator-readonly` (Monitoring/Direksi, tanpa hak ubah).
  - **`user-norole`**: tanpa role Tanki Je'ne' (Akses ditolak pada gerbang layout operator).
- **Email uji**: SMTP diarahkan ke Mailpit (`127.0.0.1:1025`); lihat email masuk di
  **http://localhost:8025**. Admin Keycloak lokal: `admin` / `admin` (`http://localhost:8080`).

### Password SMTP disimpan terenkripsi

Password SMTP tidak lagi tersimpan cleartext di tabel `konfigurasi` (Issue #7).
Ia dienkripsi AES-256-GCM dengan kunci dari environment:

```bash
openssl rand -base64 32   # → CONFIG_ENCRYPTION_KEY di .env
```

Kuncinya sengaja hanya ada di environment dan tidak pernah masuk database, agar
salinan dump `.sql` — yang di proyek ini rutin dipindah-pindah untuk master
`pelanggan` — tidak sekalian membawa kredensial mail yang bisa dipakai.

Konsekuensi yang perlu diketahui:

- Tanpa `CONFIG_ENCRYPTION_KEY`, form konfigurasi menolak menyimpan password
  SMTP dan halamannya menampilkan peringatan merah.
- Mengganti kunci membuat password lama tidak terbaca; pengiriman email berhenti
  sampai admin mengisi ulang password lewat `/dashboard/konfigurasi`.
- Baris lama yang masih cleartext tetap berfungsi dan ikut terenkripsi sendiri
  begitu admin menyimpan ulang.

Di **produksi tanpa SMTP terkonfigurasi, pengiriman email gagal terang-terangan**
dan tercatat di `notifikasi_log` — tidak lagi diam-diam "berhasil" dengan
mencetak isi email (termasuk kode OTP hidup) ke log container. Fallback console
hanya ada di luar produksi, dan kode OTP tetap tidak dicetak kecuali
`OTP_DEBUG_LOG=1` diset sadar-sadar; jalur normalnya adalah membaca Mailpit.

### Membagikan dump database

Gunakan `db/dump_sanitized.sh`, jangan `mysqldump` polos:

```bash
bash db/dump_sanitized.sh                    # → dump-YYYYmmdd-HHMM.sql
bash db/dump_sanitized.sh /tmp/berbagi.sql   # tujuan sendiri
```

Struktur seluruh tabel ikut supaya hasil restore langsung jalan, tapi **isi**
`konfigurasi` (kredensial SMTP) dan `otp_verifikasi` (hash OTP hidup, email, dan
keluhan pelapor) tidak ikut. Skrip memverifikasi hasilnya sendiri dan menolak
menghasilkan berkas bila masih ada baris yang lolos.

Ini lapis kedua setelah enkripsi di atas, bukan penggantinya. Dan perlu dicatat:
dump hasil skrip ini **tetap** memuat data pribadi pelanggan pada tabel `tiket`
dan `pelanggan` — yang dihapus hanya kredensial sistem, bukan anonimisasi.

> Saat instance produksi `DIAMOND` di VPS hidup kembali, cukup ganti
> `AUTH_KEYCLOAK_ISSUER` & `AUTH_KEYCLOAK_SECRET` di `.env` ke nilai produksi
> (lihat blok komentar di `.env`) dan provisioning via `db/keycloak_setup_tanki_client.mjs`.
## Runbook: Deployment & Verifikasi Keycloak (Realm DIAMOND)

Sistem menggunakan Keycloak terpusat pada realm `DIAMOND` yang digunakan bersama oleh beberapa aplikasi (mis. `pdam-hrms`, `pdam-hubungan-pelanggan`). Autorisasi aplikasi bergantung sepenuhnya pada validasi realm role `app-tanki` dan prefix `tanki-*`.

### 1. Konfigurasi Variabel Lingkungan (`.env`)
Pastikan variabel berikut disetel dengan benar di environment produksi / staging:
```ini
AUTH_KEYCLOAK_ID="tanki-jene"
AUTH_KEYCLOAK_SECRET="<client_secret_hasil_provisioning>"
AUTH_KEYCLOAK_ISSUER="https://diamond.pdammakassar.co.id/auth/realms/DIAMOND"
```
*Catatan: Pada pengembangan lokal via Docker, `AUTH_KEYCLOAK_ISSUER` bernilai `http://localhost:8080/realms/DIAMOND`.*

Opsional, untuk mendiagnosis masalah role saat login:
```ini
AUTH_DEBUG="1"   # cetak role hasil autentikasi ke console
```
Biarkan tidak diset di produksi. Log jalur **gagal** (mis. `realm_access.roles` tidak ditemukan) tetap muncul tanpa flag ini karena tidak memuat identitas operator; yang dipagari hanya log jalur sukses.

### 2. Prosedur Provisioning Client
Untuk mendaftarkan atau memutakhirkan client confidential `tanki-jene` di realm produksi, jalankan skrip otentikasi admin:
```bash
KC_URL="https://diamond.pdammakassar.co.id/auth" \
KC_REALM="DIAMOND" \
KC_MASTER_USER="admin" \
KC_MASTER_PASS="<password_admin_keycloak>" \
node db/keycloak_setup_tanki_client.mjs
```
Skrip ini akan memvalidasi dan meng-upsert client confidential (menaktifkan PKCE `S256` dan logout redirect) serta memastikan 4 realm roles tersedia (`app-tanki`, `tanki-operator-crud`, `tanki-operator-readonly`, `tanki-admin`).

### 2b. Verifikasi realm (read-only)

Dua item checklist Issue #2 adalah pernyataan tentang keadaan realm, bukan
tentang kode, jadi tidak bisa dicentang oleh diff mana pun. `db/keycloak_verifikasi.mjs`
mengubahnya jadi pemeriksaan yang punya status keluar:

```bash
KC_URL="https://diamond.pdammakassar.co.id/auth" \
KC_MASTER_PASS="<password_admin_keycloak>" \
node db/keycloak_verifikasi.mjs        # keluar 0 bila semua lolos, 1 bila ada yang gagal

KC_URL=http://localhost:8080 KC_MASTER_PASS=admin node db/keycloak_verifikasi.mjs   # lokal
```

Yang diperiksa: endpoint discovery + dukungan PKCE S256, client `tanki-jene`
sebagai confidential dengan authorization-code aktif dan implicit mati, redirect
URI benar-benar mencakup `/api/auth/callback/keycloak` sekaligus **tidak** memuat
`*`, lalu keempat realm role ada dan benar-benar bisa di-assign.

**Skrip ini tidak menulis apa pun** — aman dijalankan terhadap DIAMOND produksi
yang dipakai bersama `pdam-hrms` dan `pdam-hubungan-pelanggan`, dan aman
dijalankan berulang. Pasangannya yang menulis adalah `keycloak_setup_tanki_client.mjs`.

### 3. Fitur Keamanan & Diagnostik OIDC
- **Diagnostik Peran (Realm Roles):** Sistem mendekode atribut `realm_access.roles` langsung dari `access_token` Keycloak. Jika struktur token keliru atau peran hilang, server memverifikasi dengan mencatat log diagnostik di konsol (`[AUTH DIAGNOSTIC]`).
- **Refresh Token Rotation:** Akses token Keycloak berumur pendek (5-15 menit). Callback NextAuth `jwt()` secara otomatis memperbarui token via `grant_type="refresh_token"`. Jika sesi di Keycloak dicabut atau berakhir, token ditandai dengan `RefreshTokenError` dan middleware akan memaksa operator login ulang.
- **Federated Logout (OIDC RP-Initiated Logout):** Menekan tombol "Keluar" tidak hanya mematikan sesi cookie lokal NextAuth, melainkan juga memanggil end-session endpoint Keycloak (melalui rute `/api/auth/keycloak-logout` dengan parameter `id_token_hint`). Hal ini menghentikan sesi SSO secara keseluruhan sehingga mencegah akses otomatis yang tidak sah.

### Pengikatan sesi OTP lewat cookie (Issue #4)

`otpId` yang dipegang klien adalah **capability token**: 32 byte acak
(`base64url`, 43 karakter) yang tidak bisa dienumerasi. Itu sudah menutup
penyapuan `otpId` milik orang lain, tapi tidak menutup token yang bocor lewat
jalur di luar kuasa aplikasi — Referer, log reverse proxy, riwayat peramban,
layar yang terlihat orang lain.

Karena itu ada lapis kedua. Saat permintaan dibuat, server memasang cookie
`tj_otp_sesi` berisi secret 32 byte:

```
HttpOnly · SameSite=Strict · Secure (produksi) · maxAge = TTL OTP
```

Hanya **SHA-256**-nya yang tersimpan di `otp_verifikasi.session_hash`, dan
perbandingannya memakai `timingSafeEqual`. Secret-nya tidak pernah masuk
`FormState`, jadi tidak pernah ikut ke komponen klien maupun payload RSC, dan
tidak terbaca JavaScript mana pun.

Akibatnya, memegang `otpId` saja tidak lagi cukup untuk:

- menebak kode milik orang lain,
- menghabiskan jatah percobaan korban — penolakan karena cookie **sengaja tidak**
  menaikkan `attempts` dan tidak meng-`EXPIRED`-kan baris, karena kalau iya,
  token bocor tetap bisa dipakai mematikan sesi korban,
- memicu kirim ulang, yang berarti mengirim email ke alamat pelanggan sekaligus
  mengganti kode yang sudah terlanjur mereka terima.

Pesan penolakannya sama dengan kegagalan verifikasi lain, supaya tidak menjadi
oracle "token ini hidup". Kolom `session_hash` nullable: baris yang dibuat
sebelum kolom ini ada diperlakukan permisif agar pemiliknya tetap bisa
menyelesaikan permintaan yang sedang berjalan saat deploy; baris baru selalu
mengisinya.

### Tautan lacak & catatan publik/internal (Issue #6)

Email "permintaan diterima" memuat tautan lacak bertanda tangan HMAC yang
berlaku **14 hari**, sehingga pelapor tidak perlu mengetik No. Pelanggan + No. HP
— dua nilai yang justru menjadi permukaan enumerasi. Nomor tiket ikut
ditandatangani, jadi tautan tidak bisa diubah untuk membuka tiket orang lain.

```ini
TRACKING_LINK_SECRET=""   # opsional; bila kosong memakai AUTH_SECRET
```

Catatan operator kini punya penanda publik/internal (`tiket_riwayat.catatan_publik`),
bukan sekadar disembunyikan dari tampilan:

- Default kolomnya `false`, sehingga baris lama tetap tersembunyi setelah migrasi.
- Di form ubah status, checkbox "Tampilkan catatan ini kepada pelanggan"
  tercentang secara default agar alasan penolakan tetap sampai ke pelapor.
- Catatan yang ditandai internal **tidak ikut dikirim lewat email** — tanpa itu
  penandanya tidak ada artinya, karena catatan tetap sampai ke kotak masuk
  pelapor meski disembunyikan di `/lacak`.

## Verifikasi cepat

```bash
npm test                      # unit test (vitest) — rate limiter, OTP, konfigurasi
npm run build                 # harus sukses (TypeScript + bundle)
# dengan dev jalan (pakai browser atau klien HTTP apa pun):
#   /            → 200 (landing publik + form)
#   /lacak       → 200 (lacak via No. Pelanggan + No. HP)
#   /auth/sign-in→ 200 (login operator)
#   /dashboard   → 302 → /auth/sign-in (terproteksi)
```

## Laporan (FR-45..47)

`/dashboard/laporan` menampilkan rekap permintaan atas rentang tanggal, dengan
filter status, wilayah, dan rayon. Beberapa keputusan yang perlu diketahui:

- **Dimensi terbatas pada wilayah + rayon.** Master `pelanggan` tidak memuat
  cabang/golongan/tarif, dan snapshot di `tiket` hanya menyalin yang ada di master.
- **Pengelompokan memakai kolom snapshot di `tiket`,** bukan join hidup ke
  `pelanggan`. Pelanggan yang pindah rayon tidak mengubah laporan periode lalu.
- **Tanggal dihitung menurut WITA,** bukan zona server, supaya "1 Juli" berarti
  1 Juli bagi operator meski aplikasi berjalan di container ber-TZ UTC.
- **Tanggal akhir inklusif.** Rentang maksimum 366 hari; permintaan yang lebih
  lebar dipotong dari sisi tanggal awal.
- **Ekspor CSV & Excel** (`/dashboard/laporan/export?format=csv|xlsx`) memakai
  filter yang sama persis dengan layar, jadi jumlah barisnya selalu sama dengan
  angka Total. Berkas Excel menyertakan lembar `Filter` berisi parameter yang
  menghasilkannya.
- **Ekspor terbuka untuk `tanki-operator-readonly`.** Peran itu Direksi/monitoring
  dan laporan periodik justru pekerjaannya; berkasnya tidak memuat apa pun yang
  tidak sudah terlihat di layar bagi peran yang sama.

## Struktur penting

- `src/app/(public)/` — portal publik: `/` (form), `/lacak` (tracking).
- `src/app/(with-layout)/dashboard/` — area operator (gate `app-tanki`):
  `page.tsx` (dashboard), `permintaan/`, `dispatch/{kendaraan,sopir,penugasan}/`,
  `laporan/`, `pelanggan/`, `konfigurasi/`.
- `src/lib/auth/` — Auth.js + Keycloak (`index.ts`, `roles.ts`).
- `src/proxy.ts` — proteksi `/dashboard/*` (Next 16 menamai middleware `proxy.ts`).
- `prisma/schema.prisma` — model data (MySQL).
- `db/` — `pelanggan_ddl.sql`, `penugasan_guard.sql`.

## Catatan & utang teknis (scaffold)

- **`prisma db push`** dipakai (belum migrations). Kolom generated anti
  double-booking di `db/penugasan_guard.sql` berada **di luar** schema Prisma —
  `db push` berikutnya dapat menghapusnya; jalankan ulang file guard, atau
  pindah ke `prisma migrate` saat masuk fase berikut.
- **Lisensi template:** NextAdmin free tidak menyertakan file LICENSE —
  konfirmasi hak pakai untuk aplikasi pemerintah sebelum produksi.
- `pelanggan` bersifat **read-only**; tidak memuat No. HP/email/cabang/golongan.
