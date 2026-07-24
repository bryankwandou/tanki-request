#!/bin/bash
# Cek kesehatan Keycloak DIAMOND; restart container-nya bila down (502/timeout).
# Dirancang untuk dijalankan DI VPS (pdam-vm) — butuh: bash, curl, docker.
#
# Pakai (di VPS):
#   bash keycloak_healthcheck.sh
# Override bila perlu:
#   KC_URL=...  KC_REALM=...  KC_CONTAINER=<nama>  KC_COMPOSE_DIR=<dir>  bash keycloak_healthcheck.sh

set -u

KC_URL="${KC_URL:-https://diamond.pdammakassar.co.id/auth}"
KC_REALM="${KC_REALM:-DIAMOND}"
HEALTH="$KC_URL/realms/$KC_REALM"

check() { curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH" 2>/dev/null || echo "000"; }

echo "== Cek $HEALTH =="
CODE=$(check)
echo "HTTP $CODE"
if [ "$CODE" = "200" ]; then
  echo "Keycloak SEHAT. Tidak ada tindakan."
  exit 0
fi

echo "Keycloak TIDAK sehat (HTTP $CODE). Mencari container Keycloak..."
KC_CONTAINER="${KC_CONTAINER:-$(docker ps -a --format '{{.Names}}' | grep -i keycloak | head -1)}"

if [ -z "$KC_CONTAINER" ]; then
  echo "ERROR: tidak menemukan container keycloak. Set KC_CONTAINER atau KC_COMPOSE_DIR."
  echo "Daftar container:"; docker ps -a --format '  {{.Names}}\t{{.Status}}'
  exit 1
fi

echo "Container: $KC_CONTAINER"
echo "--- 20 baris log terakhir ---"
docker logs --tail 20 "$KC_CONTAINER" 2>&1 | tail -20
echo "-----------------------------"

if [ -n "${KC_COMPOSE_DIR:-}" ]; then
  echo "Restart via docker compose di $KC_COMPOSE_DIR..."
  ( cd "$KC_COMPOSE_DIR" && docker compose up -d )
else
  echo "Restart container $KC_CONTAINER..."
  docker restart "$KC_CONTAINER"
fi

echo "Menunggu Keycloak siap (maks 90 detik)..."
for i in $(seq 1 18); do
  sleep 5
  CODE=$(check)
  echo "  +$((i*5))s: HTTP $CODE"
  if [ "$CODE" = "200" ]; then
    echo "Keycloak SEHAT kembali. Lanjut: node keycloak_setup_tanki_client.mjs"
    exit 0
  fi
done

echo "ERROR: Keycloak masih belum 200 setelah restart. Cek log lebih lanjut:"
echo "  docker logs --tail 100 $KC_CONTAINER"
exit 1
