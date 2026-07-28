#!/usr/bin/env bash
# Dijalankan sekali saat Codespace dibuat. Aman diulang.
set -euo pipefail

echo "==> npm install (template ini butuh legacy-peer-deps: next-auth v5 beta vs Next 16)"
npm install --legacy-peer-deps

echo "==> menyiapkan .env"
if [ ! -f .env ]; then
  cp .env.example .env
  SECRET="$(openssl rand -base64 32)"
  # Di dalam Codespace, service Docker dijangkau lewat nama service-nya.
  {
    echo ""
    echo "# --- diisi otomatis oleh .devcontainer/setup.sh ---"
    echo "AUTH_SECRET=\"${SECRET}\""
    echo "AUTH_TRUST_HOST=\"true\""
  } >> .env
  echo "    .env dibuat, AUTH_SECRET digenerate."
else
  echo "    .env sudah ada, dilewati."
fi

echo "==> menyalakan MySQL + Mailpit + Keycloak"
docker compose up -d

echo "==> menunggu MySQL siap"
for i in $(seq 1 60); do
  if docker exec tanki-mysql mysqladmin ping -uroot -prootpass --silent >/dev/null 2>&1; then
    echo "    MySQL siap setelah ${i} detik."
    break
  fi
  sleep 1
done

echo "==> membuat tabel dari Prisma schema"
npx prisma generate
npx prisma db push --skip-generate

echo "==> guard anti double-booking"
docker exec -i tanki-mysql mysql -uroot -prootpass tanki_jene < db/penugasan_guard.sql || \
  echo "    (dilewati — jalankan manual bila perlu)"

cat <<'BANNER'

============================================================
  Siap. Langkah berikutnya:

    npm test          # unit test (detik)
    npx tsc --noEmit  # typecheck
    npm run build     # build produksi
    npm run dev       # http://localhost:3000

  Email OTP dibaca di Mailpit  → port 8025 (tab PORTS)
  Keycloak lokal               → port 8080  (admin / admin)

  Setup Keycloak realm + user uji:
    node db/keycloak_local_setup.mjs

  Master pelanggan (~231k baris) TIDAK diimpor otomatis.
  Kalau butuh data pelanggan asli, jalankan blok import di README.
============================================================

BANNER
