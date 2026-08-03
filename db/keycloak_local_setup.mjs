// Setup Keycloak LOKAL (docker, start-dev) untuk development Tanki Je'ne'.
// Membuat realm DIAMOND + roles + confidential client tanki-jene + user uji.
// Pakai: node db/keycloak_local_setup.mjs   (Keycloak lokal di http://localhost:8080)

const KC = process.env.KC_URL || "http://localhost:8080";
const ADMIN_USER = process.env.KC_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.KC_ADMIN_PASS || "admin";
const REALM = "DIAMOND";

const ROLES = [
  ["app-tanki", "Base role: boleh masuk aplikasi Tanki Je'ne'"],
  ["tanki-operator-crud", "Operator CRUD"],
  ["tanki-operator-readonly", "Read-only / Direksi"],
  ["tanki-admin", "Admin: konfigurasi + CRUD"],
];
const TEST_PASS = "Operator123!";
const TEST_ACCOUNTS = [
  { username: "operator", email: "operator@tanki.local", firstName: "Operator", lastName: "Admin", roles: ["app-tanki", "tanki-operator-crud", "tanki-admin"], desc: "Full akses + konfigurasi admin" },
  { username: "operator-crud", email: "operator.crud@tanki.local", firstName: "Operator", lastName: "CRUD", roles: ["app-tanki", "tanki-operator-crud"], desc: "Akses CRUD operasional (tanpa config admin)" },
  { username: "operator-readonly", email: "operator.readonly@tanki.local", firstName: "Operator", lastName: "ReadOnly", roles: ["app-tanki", "tanki-operator-readonly"], desc: "Akses baca/monitoring (Direksi/Laporan)" },
  { username: "user-norole", email: "user.norole@tanki.local", firstName: "User", lastName: "NoRole", roles: [], desc: "Akun DIAMOND tanpa role Tanki (harus ditolak oleh sistem)" },
];

const die = (m) => { console.error("ERROR:", m); process.exit(1); };

async function main() {
  // 1. admin token
  const tr = await fetch(`${KC}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", client_id: "admin-cli", username: ADMIN_USER, password: ADMIN_PASS }),
  }).catch((e) => die("token: " + e.message));
  if (!tr.ok) die(`token HTTP ${tr.status}: ${await tr.text()}`);
  const TOKEN = (await tr.json()).access_token;
  const H = { Authorization: `Bearer ${TOKEN}` };
  const HJ = { ...H, "Content-Type": "application/json" };
  const A = `${KC}/admin/realms`;
  console.log("admin token OK");

  // 2. realm
  let r = await fetch(`${A}`, { method: "POST", headers: HJ, body: JSON.stringify({ realm: REALM, enabled: true }) });
  console.log(`realm ${REALM}: HTTP ${r.status}${r.status === 409 ? " (sudah ada)" : ""}`);

  // 3. roles
  for (const [name, description] of ROLES) {
    r = await fetch(`${A}/${REALM}/roles`, { method: "POST", headers: HJ, body: JSON.stringify({ name, description }) });
    console.log(`  role ${name}: HTTP ${r.status}`);
  }

  // 4. client (drop + recreate)
  const ex = await (await fetch(`${A}/${REALM}/clients?clientId=tanki-jene`, { headers: H })).json();
  if (ex[0]) await fetch(`${A}/${REALM}/clients/${ex[0].id}`, { method: "DELETE", headers: H });
  r = await fetch(`${A}/${REALM}/clients`, {
    method: "POST", headers: HJ,
    body: JSON.stringify({
      clientId: "tanki-jene", name: "Tanki Je'ne'", enabled: true,
      publicClient: false, standardFlowEnabled: true, directAccessGrantsEnabled: true,
      fullScopeAllowed: true,
      redirectUris: ["http://localhost:3000/*"], webOrigins: ["http://localhost:3000"],
      attributes: { "post.logout.redirect.uris": "+", "pkce.code.challenge.method": "S256" },
    }),
  });
  console.log(`client tanki-jene: HTTP ${r.status}`);
  const cid = (await (await fetch(`${A}/${REALM}/clients?clientId=tanki-jene`, { headers: H })).json())[0].id;
  const secret = (await (await fetch(`${A}/${REALM}/clients/${cid}/client-secret`, { headers: H })).json()).value;

  // 5. test users (create or reuse) + password + roles matrix
  console.log("=== 5. Provisioning akun pengujian matriks role ===");
  for (const acc of TEST_ACCOUNTS) {
    await fetch(`${A}/${REALM}/users`, {
      method: "POST", headers: HJ,
      body: JSON.stringify({
        username: acc.username, enabled: true, emailVerified: true,
        email: acc.email, firstName: acc.firstName, lastName: acc.lastName,
      }),
    });
    const uRes = await fetch(`${A}/${REALM}/users?username=${acc.username}&exact=true`, { headers: H });
    const uJson = await uRes.json();
    if (!uJson || uJson.length === 0) continue;
    const uid = uJson[0].id;

    await fetch(`${A}/${REALM}/users/${uid}/reset-password`, {
      method: "PUT", headers: HJ,
      body: JSON.stringify({ type: "password", value: TEST_PASS, temporary: false }),
    });

    if (acc.roles.length > 0) {
      const roleReps = [];
      for (const rn of acc.roles) {
        const roleRes = await fetch(`${A}/${REALM}/roles/${rn}`, { headers: H });
        roleReps.push(await roleRes.json());
      }
      const mapRes = await fetch(`${A}/${REALM}/users/${uid}/role-mappings/realm`, {
        method: "POST", headers: HJ, body: JSON.stringify(roleReps),
      });
      console.log(`  user ${acc.username} (roles: ${acc.roles.join(",")}): HTTP ${mapRes.status}`);
    } else {
      console.log(`  user ${acc.username} (tanpa role Tanki Je'ne'): disiapkan`);
    }
  }

  console.log("\n=== DONE (lokal) ===");
  console.log(`Issuer:               ${KC}/realms/${REALM}`);
  console.log(`AUTH_KEYCLOAK_ID:     tanki-jene`);
  console.log(`AUTH_KEYCLOAK_SECRET= ${secret}`);
  console.log("\n=== Matriks Akun Uji Keycloak (Password semua akun: Operator123!) ===");
  for (const acc of TEST_ACCOUNTS) {
    console.log(`- ${acc.username.padEnd(18)} : ${acc.desc}`);
  }
}
main();
