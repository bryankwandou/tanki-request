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
npx prisma db push
docker exec -i tanki-mysql mysql -uroot -prootpass tanki_jene < db/penugasan_guard.sql

# 4. Env: salin .env.example → .env, lalu isi AUTH_SECRET & AUTH_KEYCLOAK_SECRET
cp .env.example .env
# openssl rand -base64 32   → AUTH_SECRET

# 5. Jalankan
npm run dev   # http://localhost:3000
```

## Dev lokal: Keycloak + Mailpit (login & email jalan tanpa VPS)

`docker compose up -d` sudah menjalankan **Keycloak** (`:8080`) dan **Mailpit** (`:8025`)
selain MySQL. Untuk menyiapkan realm + client + user uji:

```bash
docker compose up -d                    # mysql + keycloak + mailpit
node db/keycloak_local_setup.mjs        # buat realm DIAMOND, client tanki-jene, roles, user uji
# salin AUTH_KEYCLOAK_SECRET yang dicetak → .env  (issuer = http://localhost:8080/realms/DIAMOND)
```

- **Login uji**: buka `http://localhost:3000/dashboard` → diarahkan ke Keycloak lokal →
  masuk sebagai **`operator` / `Operator123!`** (punya `app-tanki`, `tanki-operator-crud`, `tanki-admin`).
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
