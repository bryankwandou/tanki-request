#!/usr/bin/env bash
#
# Dump MySQL yang aman untuk dibagikan (Issue #7).
#
# Di proyek ini dump .sql rutin keluar-masuk container untuk master `pelanggan`
# ~231k baris, dan salinannya berpindah tangan lewat chat, flashdisk, dan email.
# Tabel `konfigurasi` memuat kredensial SMTP; `otp_verifikasi` memuat hash kode
# yang sedang hidup beserta email dan keluhan pelapor. Keduanya tidak punya
# alasan untuk ikut ke dalam salinan yang dibagikan.
#
# Sejak MR Issue #7, `smtp_pass` sudah tersimpan terenkripsi dan kuncinya hanya
# ada di environment — jadi dump biasa pun tidak lagi menyerahkan password yang
# langsung bisa dipakai. Skrip ini lapis kedua: struktur tabelnya tetap ikut
# supaya hasil restore langsung jalan, tapi ISI kedua tabel itu tidak ikut.
#
# Pemakaian:
#   bash db/dump_sanitized.sh                       # → dump-YYYYmmdd-HHMM.sql
#   bash db/dump_sanitized.sh /tmp/berbagi.sql      # tujuan sendiri
#
# Variabel yang bisa ditimpa: CONTAINER, DB_NAME, DB_USER, DB_PASS
set -euo pipefail

CONTAINER="${CONTAINER:-tanki-mysql}"
DB_NAME="${DB_NAME:-tanki_jene}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-rootpass}"
OUT="${1:-dump-$(date +%Y%m%d-%H%M).sql}"

# Tabel yang strukturnya ikut, tapi datanya TIDAK.
SENSITIVE=(konfigurasi otp_verifikasi)

mysql_in() { docker exec -i "$CONTAINER" mysql -u"$DB_USER" -p"$DB_PASS" "$@"; }
dump() { docker exec -i "$CONTAINER" mysqldump -u"$DB_USER" -p"$DB_PASS" "$@"; }

echo "Membuat dump tersanitasi dari $DB_NAME (container: $CONTAINER)"

ignore_args=()
for t in "${SENSITIVE[@]}"; do
  ignore_args+=(--ignore-table="${DB_NAME}.${t}")
done

{
  # 1. Semua tabel selain yang sensitif — struktur + data.
  dump --single-transaction --routines --events \
       "${ignore_args[@]}" "$DB_NAME"

  # 2. Tabel sensitif — struktur saja, tanpa satu baris pun data.
  echo ""
  echo "-- ------------------------------------------------------------------"
  echo "-- Tabel di bawah ini sengaja DIKOSONGKAN (Issue #7)."
  echo "-- konfigurasi   : memuat kredensial SMTP"
  echo "-- otp_verifikasi: memuat hash OTP hidup, email, dan keluhan pelapor"
  echo "-- Isi ulang lewat /dashboard/konfigurasi setelah restore."
  echo "-- ------------------------------------------------------------------"
  dump --single-transaction --no-data "$DB_NAME" "${SENSITIVE[@]}"
} > "$OUT"

# Verifikasi, bukan sekadar percaya: gagalkan skrip kalau ada yang lolos.
gagal=0
for t in "${SENSITIVE[@]}"; do
  if grep -qE "^INSERT INTO \`?${t}\`?" "$OUT"; then
    echo "GAGAL: masih ada baris data untuk tabel ${t} di $OUT" >&2
    gagal=1
  fi
done
if grep -qiE "smtp_pass'?,\s*'[^']+'" "$OUT"; then
  echo "GAGAL: terdeteksi nilai smtp_pass di dalam dump" >&2
  gagal=1
fi
[ "$gagal" -eq 0 ] || { rm -f "$OUT"; exit 1; }

baris=$(wc -l < "$OUT")
echo "Selesai: $OUT (${baris} baris)"
echo "Tabel dikosongkan: ${SENSITIVE[*]}"
echo
echo "Catatan: dump ini TETAP memuat data pribadi pelanggan (nama, alamat,"
echo "No. HP, email pada tiket). Perlakukan sesuai ketentuan perlindungan data;"
echo "skrip ini hanya menghapus kredensial sistem, bukan menganonimkan pelanggan."
