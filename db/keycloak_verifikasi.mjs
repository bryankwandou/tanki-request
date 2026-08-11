// Verifikasi READ-ONLY realm Keycloak untuk Tanki Je'ne' (Issue #2).
//
// Dua item checklist Issue #2 tidak bisa dicentang oleh diff mana pun — keduanya
// pernyataan tentang keadaan realm DIAMOND, bukan tentang kode:
//
//   [ ] Client `tanki-jene` ada sebagai confidential client dengan redirect URI benar
//   [ ] Empat realm role ada dan bisa di-assign
//
// Skrip ini mengubahnya jadi pemeriksaan yang bisa dijalankan dan punya status
// keluar. Ia TIDAK MENULIS APA PUN — aman dijalankan terhadap DIAMOND produksi
// yang dipakai bersama pdam-hrms dan pdam-hubungan-pelanggan, dan aman dijalankan
// berulang kali. Pasangannya yang menulis adalah keycloak_setup_tanki_client.mjs.
//
// Pakai:
//   node db/keycloak_verifikasi.mjs                       # default: DIAMOND produksi
//   KC_URL=http://localhost:8080 node db/keycloak_verifikasi.mjs
//
// Env: KC_URL, KC_REALM, KC_MASTER_USER, KC_MASTER_PASS, KC_CLIENT_ID
//      KC_INSECURE=1 -> lewati verifikasi TLS (hanya bila cert self-signed)
//      APP_URL       -> asal aplikasi yang harus tercakup redirect URI
//
// Keluar 0 bila semua lolos, 1 bila ada yang gagal — jadi bisa dipasang di CI
// atau dijalankan sebagai gerbang sebelum rilis.

if (process.env.KC_INSECURE === "1") process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const KC_URL = (process.env.KC_URL || "https://diamond.pdammakassar.co.id/auth").replace(/\/$/, "");
const KC_REALM = process.env.KC_REALM || "DIAMOND";
const KC_MASTER_USER = process.env.KC_MASTER_USER || "admin";
const KC_MASTER_PASS = process.env.KC_MASTER_PASS || "admin";
const CLIENT_ID = process.env.KC_CLIENT_ID || "tanki-jene";
const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

const ROLES = ["app-tanki", "tanki-operator-crud", "tanki-operator-readonly", "tanki-admin"];

let gagal = 0;
const ok = (t, d) => console.log("  LULUS  %s%s", t, d ? " — " + d : "");
const no = (t, d) => {
  gagal++;
  console.log("  GAGAL  %s%s", t, d ? " — " + d : "");
};
const cek = (syarat, t, d) => (syarat ? ok(t, d) : no(t, d));

async function adminToken() {
  const r = await fetch(`${KC_URL}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: KC_MASTER_USER,
      password: KC_MASTER_PASS,
    }),
  });
  if (!r.ok) {
    console.error(`\nTidak bisa mengambil token admin dari ${KC_URL} (HTTP ${r.status}).`);
    console.error("Periksa KC_URL / KC_MASTER_USER / KC_MASTER_PASS.");
    process.exit(2);
  }
  return (await r.json()).access_token;
}

const api = (tok, path) =>
  fetch(`${KC_URL}/admin/realms/${KC_REALM}${path}`, {
    headers: { authorization: `Bearer ${tok}` },
  });

async function main() {
  console.log(`Verifikasi realm ${KC_REALM} di ${KC_URL}\n`);
  const tok = await adminToken();

  // --- 1. Endpoint discovery: yang benar-benar dipakai Auth.js sebagai issuer.
  console.log("1. Discovery OIDC");
  const disc = await fetch(`${KC_URL}/realms/${KC_REALM}/.well-known/openid-configuration`);
  cek(disc.ok, "endpoint discovery terbaca", `HTTP ${disc.status}`);
  if (disc.ok) {
    const d = await disc.json();
    cek(
      Array.isArray(d.code_challenge_methods_supported) &&
        d.code_challenge_methods_supported.includes("S256"),
      "realm mengumumkan dukungan PKCE S256",
    );
    console.log(`         issuer = ${d.issuer}`);
    console.log("         (nilai inilah yang harus diisikan ke AUTH_KEYCLOAK_ISSUER)");
  }

  // --- 2. Client tanki-jene.
  console.log(`\n2. Client ${CLIENT_ID}`);
  const cr = await api(tok, `/clients?clientId=${encodeURIComponent(CLIENT_ID)}`);
  const clients = cr.ok ? await cr.json() : [];
  const c = clients[0];

  if (!c) {
    no(`client ${CLIENT_ID} ada di realm`, "tidak ditemukan");
    console.log("         Jalankan: node db/keycloak_setup_tanki_client.mjs");
  } else {
    ok(`client ${CLIENT_ID} ada di realm`);
    cek(c.publicClient === false, "confidential (publicClient=false)",
        `publicClient=${c.publicClient}`);
    cek(c.standardFlowEnabled === true, "authorization code flow aktif");
    cek(c.implicitFlowEnabled === false, "implicit flow nonaktif",
        `implicitFlowEnabled=${c.implicitFlowEnabled}`);
    cek(c.attributes?.["pkce.code.challenge.method"] === "S256",
        "client mewajibkan PKCE S256",
        `nilai=${c.attributes?.["pkce.code.challenge.method"] ?? "(tidak diset)"}`);
    cek(c.serviceAccountsEnabled !== true, "service account tidak diaktifkan tanpa perlu");

    // Redirect URI harus mencakup callback aplikasi, dan tidak boleh wildcard bulat.
    const uris = c.redirectUris ?? [];
    const callback = `${APP_URL}/api/auth/callback/keycloak`;
    const tercakup = uris.some((u) => {
      if (u === "*") return false;
      const re = new RegExp("^" + u.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
      return re.test(callback);
    });
    cek(tercakup, `redirect URI mencakup ${callback}`, uris.join(", ") || "(kosong)");
    cek(!uris.includes("*"), "tidak ada redirect URI '*' (open redirect)",
        uris.includes("*") ? "ADA '*' — wajib dihapus" : "");
  }

  // --- 3. Realm role.
  console.log("\n3. Realm role");
  const rr = await api(tok, "/roles?briefRepresentation=true&max=200");
  const nama = rr.ok ? (await rr.json()).map((x) => x.name) : [];
  for (const r of ROLES) cek(nama.includes(r), `role ${r} ada`);

  // "Bisa di-assign" = benar-benar muncul di daftar role yang tersedia untuk
  // di-assign ke user, bukan sekadar ada di realm.
  const ur = await api(tok, "/users?max=1");
  const users = ur.ok ? await ur.json() : [];
  if (users[0]) {
    const av = await api(tok, `/users/${users[0].id}/role-mappings/realm/available`);
    if (av.ok) {
      const tersedia = (await av.json()).map((x) => x.name);
      const eff = await api(tok, `/users/${users[0].id}/role-mappings/realm/composite`);
      const terpasang = eff.ok ? (await eff.json()).map((x) => x.name) : [];
      for (const r of ROLES) {
        cek(tersedia.includes(r) || terpasang.includes(r),
            `role ${r} bisa di-assign ke user`);
      }
    }
  } else {
    console.log("  LEWAT  tidak ada user di realm untuk menguji assignability");
  }

  console.log(gagal === 0
    ? "\nSemua pemeriksaan lolos."
    : `\n${gagal} pemeriksaan GAGAL — lihat daftar di atas.`);
  process.exit(gagal === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nGagal menjalankan verifikasi:", e.message);
  process.exit(2);
});
