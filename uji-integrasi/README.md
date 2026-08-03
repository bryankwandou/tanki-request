# Uji integrasi lapis 3

Uji yang tidak bisa dibuktikan unit test karena butuh MySQL, Redis, Mailpit,
atau Keycloak yang benar-benar berjalan (Issue #8).

```bash
docker compose up -d                       # mysql + redis + mailpit + keycloak
node db/keycloak_local_setup.mjs           # realm DIAMOND + 4 role + 4 akun uji
npx prisma db push
npm run dev                                # harus hidup di :3000
npx vitest run --config vitest.integrasi.config.ts
```

Berkas ini sengaja berakhiran `.spec-int.ts`, bukan `.test.ts`, supaya
`npm test` (unit, tanpa infrastruktur) tidak ikut memungutnya.

Beberapa kasus membaca **general_log MySQL** dan **kunci di Redis** lewat
`docker exec`, bukan HTML — untuk item seperti "catatan tidak ikut tertarik dari
DB" dan "membuka form tidak memakan jatah throttle", memeriksa HTML saja
lolos-palsu.

Data uji yang diharapkan ada: tiket `TJ-UJI-0001..0005` dan `TJ-LUAR-0006`,
dengan dua baris `tiket_riwayat` pada TJ-UJI-0001 (satu publik, satu internal).
