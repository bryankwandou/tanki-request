# Handoff — lanjutkan pekerjaan di Codespace

Dokumen ini dibaca oleh manusia **dan** oleh AI assistant di workspace baru.
Isinya: keadaan repo saat ini, apa yang sudah dikerjakan, dan apa yang tersisa.

> Branch ini (`chore/devcontainer`) **tidak pernah di-merge** ke MR mana pun.
> Isinya hanya perkakas lingkungan, bukan kode aplikasi.

---

## 1. Keadaan Merge Request (per 28 Juli 2026)

Repo: `https://gitlab.com/ptfic/pdam/tanki-request`
Reviewer: **@deryfebriantara**

| MR | Issue | Branch | Target | Status |
|----|-------|--------|--------|--------|
| !3 | #5 + #6 | `bugfix/rate-limit-bypass` | `main` | direvisi, menunggu review ulang |
| !4 | #2 | `fix/keycloak-login-e2e` | `main` | direvisi, menunggu review ulang |
| !8 | #4 (Critical) | `fix/issue-4-otp-hardening` | `bugfix/rate-limit-bypass` | baru, menunggu review |
| !9 | #3 | `fix/issue-3-otp-config` | `fix/issue-4-otp-hardening` | baru, menunggu review |
| !1 !2 !5 !6 !7 | — | — | — | **ditutup** (duplikat / superseded) |

**Urutan merge wajib:** `!3 → !8 → !9`. MR !4 berdiri sendiri.

Alasan bertumpuk: !8 memakai `extractClientIp()` dari !3; !9 memakai semantik
`attempts` yang difinalkan di !8. Setelah !3 masuk `main`, target !8 diarahkan
ke `main`, begitu seterusnya.

---

## 2. Yang sudah dikerjakan

### MR !3 — Issue #5 (rate limiter) + Issue #6 (`/lacak`)

- `extractClientIp()`: index yang benar `panjang - N`, bukan `panjang - N - 1`.
  Nginx `$proxy_add_x_forwarded_for` menempelkan IP asli di ujung **kanan**,
  jadi kode lama mengembalikan nilai kiriman penyerang dan rotasi header selalu
  menghasilkan bucket baru.
- `trustedProxyCount()` memvalidasi env — NaN / 0 / negatif / Infinity → 1.
- Dead code `if (hits.length === 0)` dihapus; pembersihan key lewat TTL.
- Redis atomik: sliding window jadi satu Lua script di atas sorted set.
- Redis mati → degradasi ke in-memory dengan cooldown 30 detik, bukan 500.
- Scope creep dikeluarkan: `vercel.json`, `.npmrc`, `postinstall`.
- `/lacak`: validasi NOP/HP, `select` eksplisit (bukan `include` polos) supaya
  `catatan` operator tidak ditarik dari DB, rate limit hanya saat `hasQuery`.

### MR !4 — Issue #2 (Keycloak)

- `id_token` dikeluarkan dari objek session (session disajikan apa adanya oleh
  `GET /api/auth/session` dan terbaca JS klien).
- `/api/auth/keycloak-logout` redirect di sisi server, membaca token lewat
  `getToken()`, dan menghapus cookie sesi sendiri.
- Open redirect ditutup — `callbackUrl` divalidasi origin-nya.
- PII dibuang dari log; sisanya dipagari `AUTH_DEBUG=1`.
- Refresh token single-flight per refresh token.
- Dekode JWT pakai `base64url`.

### MR !8 — Issue #4 (Critical)

- `attempts` tidak pernah di-reset saat kirim ulang (akar bypass-nya).
- Kirim ulang ditolak bila cap habis, permintaan ditandai `EXPIRED`.
- `resend_count` maks 3 + `last_sent_at` cooldown 60 detik (kolom baru).
- Throttle verify/resend per-IP **dan** per-email, bukan per-`otpId`.

### MR !9 — Issue #3

- `otp_max_attempts` configurable + tampil di form admin.
- Template email ketiga notifikasi configurable dengan placeholder.
- Drift default ditutup — fallback merujuk `CONFIG_DEFAULTS`.
- Clamp sisi server (`NUMERIC_BOUNDS`), saat simpan **dan** saat baca.
- README diperbarui.

---

## 3. Pengujian yang SUDAH dilakukan (lapis 1 & 2, tanpa Docker)

```
npm test          → 36 passed (36)
npx tsc --noEmit  → 0 error
npm run build     → ✓ Compiled successfully
```

Rincian test:

| berkas | kasus | menguji |
|---|---|---|
| `src/lib/tanki/rate-limit.test.ts` | 13 | resolusi XFF, rotasi spoof, env NaN, sliding window, degradasi Redis |
| `src/lib/auth/logout-redirect.test.ts` | 10 | open redirect (7 varian), session bebas token |
| `src/lib/tanki/otp-resend.test.ts` | 9 | attempt-cap bypass, simulasi penyerang 100 putaran, cooldown |
| `src/lib/tanki/config-bounds.test.ts` | 14 | drift default, clamp, renderer template |

> `logout-redirect.test.ts` hanya ada di branch `fix/keycloak-login-e2e`.
> Tiga sisanya menumpuk di jalur `!3 → !8 → !9`.

---

## 4. Yang BELUM diuji — inilah tugas di Codespace (lapis 3)

Semuanya butuh Docker, yang tidak bisa jalan di mesin lokal (virtualisasi
bermasalah). Container sudah disiapkan `.devcontainer/setup.sh`.

### A. Alur OTP end-to-end (MR !8 + !9)

1. Buka `/`, isi form permintaan dengan No. Pelanggan yang ada di master.
2. Baca kode OTP di **Mailpit** (port 8025).
3. **Uji bypass Issue #4**: masukkan kode salah sampai cap habis, lalu tekan
   "Kirim ulang". Harus **ditolak** — sebelum perbaikan, jatah tebakan pulih.
4. Uji cooldown: tekan kirim ulang dua kali beruntun → pesan "tunggu N detik".
5. Uji batas kirim ulang: 3x kirim ulang, yang keempat ditolak.
6. **Uji template (MR !9)**: ubah template di `/dashboard/konfigurasi`,
   pakai `{{kode}}` dan `{{ttl}}`, kirim ulang, cek hasilnya di Mailpit.
7. **Uji clamp**: isi `otp_max_attempts` dengan `9999`, simpan, muat ulang
   halaman → harus tersimpan sebagai `10`.

### B. Rate limiter dengan IP palsu (MR !3)

```bash
# harus SEMUA masuk bucket yang sama → yang ke-21 diblokir
for i in $(seq 1 25); do
  curl -s -o /dev/null -w "%{http_code} " \
    -H "X-Forwarded-For: 9.9.9.$i, 203.0.113.9" \
    "http://localhost:3000/lacak?nop=123456789&hp=081234567890"
done
```

Sebelum perbaikan, tiap request dapat bucket baru dan tidak pernah terblokir.

Uji juga: buka `/lacak` **tanpa** query 30x — tidak boleh memakan kuota.

### C. Login Keycloak (MR !4)

```bash
node db/keycloak_local_setup.mjs   # realm DIAMOND + 4 akun uji
```

1. Login sebagai `operator` / `Operator123!` → masuk dashboard.
2. Login sebagai `user-norole` → **harus ditolak**.
3. **Uji kebocoran token**: setelah login, buka `/api/auth/session`.
   Response **tidak boleh** memuat `idToken`, `accessToken`, `refreshToken`.
4. **Uji open redirect**: buka
   `/api/auth/keycloak-logout?callbackUrl=https://evil.com`
   → harus mendarat di `/auth/sign-in`, bukan evil.com.
5. Klik Keluar → sesi SSO Keycloak ikut tertutup (buka lagi `/dashboard`,
   harus diminta login ulang, bukan langsung masuk).

### D. Redis (opsional, MR !3)

```bash
docker run -d --name tanki-redis -p 6379:6379 redis:7
# set REDIS_URL="redis://localhost:6379" di .env, restart dev server
docker stop tanki-redis   # aplikasi harus TETAP jalan, turun ke in-memory
```

---

## 5. Aturan kerja yang diminta reviewer

1. **Satu MR = satu issue.** Branch selalu dibuat dari `main` yang bersih.
2. **Fix harus benar-benar dipakai** — cek `grep` nama fungsi baru sebelum push.
3. **Jalankan sendiri skenario penyerangnya**, jangan hanya membaca kode.
4. **Jangan campur perubahan build** (`vercel.json`, `.npmrc`, `postinstall`).
5. **Menyimpang dari checklist boleh, diam-diam tidak** — tulis di deskripsi MR.
6. Sebelum commit: `git diff --stat` untuk memeriksa cakupan, dan `git add -p`
   alih-alih `git add .`.

---

## 6. Prompt untuk AI assistant di workspace baru

Salin blok di bawah ini apa adanya sebagai pesan pertama:

```
Baca .devcontainer/HANDOFF.md di repo ini — isinya keadaan lengkap pekerjaan
saya: 4 merge request terbuka di GitLab ptfic/pdam/tanki-request (!3, !4, !8, !9)
yang sudah direvisi mengikuti review, plus 36 unit test yang lolos.

Lapis 1 (unit test) dan lapis 2 (typecheck + build) SUDAH hijau di mesin lokal.
Yang belum pernah dijalankan adalah lapis 3 — pengujian end-to-end yang butuh
Docker, karena virtualisasi di laptop saya bermasalah. Itulah alasan saya pindah
ke Codespace ini.

Tugas kamu: jalankan seluruh bagian 4 di HANDOFF.md (A sampai D) dan laporkan
hasil sebenarnya per item — lolos, gagal, atau tidak bisa dijalankan beserta
alasannya. Jangan memperbaiki kode aplikasi dulu sebelum saya lihat hasilnya.

Kalau ada yang gagal, tunjukkan output aslinya, jangan diringkas jadi kesimpulan.

Mulai dengan memastikan container sudah siap:
  docker compose ps
  npm test
lalu lanjut ke pengujian A.

Catatan penting: jangan commit apa pun ke branch fitur (bugfix/rate-limit-bypass,
fix/keycloak-login-e2e, fix/issue-4-otp-hardening, fix/issue-3-otp-config) tanpa
saya minta. Kalau perlu file bantu untuk pengujian, taruh di /tmp atau di branch
chore/devcontainer.
```
