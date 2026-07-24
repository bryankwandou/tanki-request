// Provision Keycloak untuk Tanki Je'ne' di realm DIAMOND (existing, shared).
// Membuat client `tanki-jene` (CONFIDENTIAL — Auth.js menukar code di server)
// + 4 realm role (app-tanki + tanki-*). Idempotent: client di-drop & dibuat ulang,
// role di-upsert. Tidak menyentuh client/role pdam-hrms.
//
// Pakai: node db/keycloak_setup_tanki_client.mjs
// Env (opsional): KC_URL, KC_REALM, KC_MASTER_USER, KC_MASTER_PASS
//   KC_INSECURE=1  -> lewati verifikasi sertifikat TLS (hanya bila cert self-signed)
// Butuh: Node 18+ (global fetch). Tidak butuh curl.

// TLS diverifikasi secara default. Set KC_INSECURE=1 hanya bila perlu.
if (process.env.KC_INSECURE === "1") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const KC_URL = process.env.KC_URL || "https://diamond.pdammakassar.co.id/auth";
const KC_REALM = process.env.KC_REALM || "DIAMOND";
const KC_MASTER_USER = process.env.KC_MASTER_USER || "admin";
const KC_MASTER_PASS = process.env.KC_MASTER_PASS || "AdminKeycloak2024Strong";

const REDIRECT_URIS = [
  "http://localhost:3000/*",
  "https://tangki.pdam-makassar.go.id/*",
  "https://diamond.pdammakassar.co.id/tanki/*",
];
const WEB_ORIGINS = [
  "http://localhost:3000",
  "https://tangki.pdam-makassar.go.id",
  "https://diamond.pdammakassar.co.id",
];

const ROLES = [
  ["app-tanki", "Base role: boleh masuk aplikasi Tanki Je'ne'"],
  ["tanki-operator-crud", "Operator CRUD: kelola tiket, dispatch, master"],
  ["tanki-operator-readonly", "Read-only: lihat tiket/antrian/laporan (Direksi)"],
  ["tanki-admin", "Admin: konfigurasi OTP/template + hak CRUD"],
];

function die(msg) {
  console.error("ERROR:", msg);
  process.exit(1);
}

async function main() {
  console.log("=== 1. Get admin token ===");
  const tokRes = await fetch(
    `${KC_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: KC_MASTER_USER,
        password: KC_MASTER_PASS,
      }),
    },
  ).catch((e) => die("token request gagal: " + e.message));
  if (!tokRes.ok) die(`token HTTP ${tokRes.status}: ${await tokRes.text()}`);
  const TOKEN = (await tokRes.json()).access_token;
  if (!TOKEN) die("tidak ada access_token");
  console.log(`Token OK (${TOKEN.slice(0, 18)}...)`);

  const ADMIN = `${KC_URL}/admin/realms/${KC_REALM}`;
  const auth = { Authorization: `Bearer ${TOKEN}` };
  const authJson = { ...auth, "Content-Type": "application/json" };

  console.log("=== 2. Upsert realm roles ===");
  for (const [name, description] of ROLES) {
    const r = await fetch(`${ADMIN}/roles`, {
      method: "POST",
      headers: authJson,
      body: JSON.stringify({ name, description }),
    });
    console.log(`  upsert ${name}: HTTP ${r.status}`);
  }

  console.log("=== 3. Drop existing client 'tanki-jene' if any ===");
  const exRes = await fetch(`${ADMIN}/clients?clientId=tanki-jene`, { headers: auth });
  const existing = (await exRes.json())[0];
  if (existing) {
    console.log(`  Found (id=${existing.id}), deleting...`);
    await fetch(`${ADMIN}/clients/${existing.id}`, { method: "DELETE", headers: auth });
  }

  console.log("=== 4. Create CONFIDENTIAL client 'tanki-jene' ===");
  const createRes = await fetch(`${ADMIN}/clients`, {
    method: "POST",
    headers: authJson,
    body: JSON.stringify({
      clientId: "tanki-jene",
      name: "Tanki Je'ne'",
      description: "Confidential client untuk Tanki Je'ne' (Next.js + Auth.js)",
      enabled: true,
      publicClient: false,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      implicitFlowEnabled: false,
      serviceAccountsEnabled: false,
      fullScopeAllowed: true,
      redirectUris: REDIRECT_URIS,
      webOrigins: WEB_ORIGINS,
      attributes: {
        "post.logout.redirect.uris": "+",
        "pkce.code.challenge.method": "S256",
      },
    }),
  });
  console.log(`  create client: HTTP ${createRes.status}`);

  const newRes = await fetch(`${ADMIN}/clients?clientId=tanki-jene`, { headers: auth });
  const client = (await newRes.json())[0];
  if (!client) die("client tidak ditemukan setelah create");
  console.log(`  New client id: ${client.id}`);

  console.log("=== 5. Retrieve client secret ===");
  const secRes = await fetch(`${ADMIN}/clients/${client.id}/client-secret`, { headers: auth });
  const secret = (await secRes.json()).value;

  console.log("=== Done ===");
  console.log(`Client:  tanki-jene (${client.id}) — confidential, PKCE S256`);
  console.log(`Realm:   ${KC_REALM}`);
  console.log("Roles:   app-tanki (base), tanki-operator-crud, tanki-operator-readonly, tanki-admin");
  console.log(`Issuer:  ${KC_URL}/realms/${KC_REALM}`);
  console.log(`AUTH_KEYCLOAK_SECRET=${secret}`);
}

main();
