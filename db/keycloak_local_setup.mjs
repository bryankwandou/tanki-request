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
const TEST_USER = "operator";
const TEST_PASS = "Operator123!";
const TEST_ROLES = ["app-tanki", "tanki-operator-crud", "tanki-admin"];

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

  // 5. test user (create or reuse) + password + roles
  await fetch(`${A}/${REALM}/users`, {
    method: "POST", headers: HJ,
    body: JSON.stringify({
      username: TEST_USER, enabled: true, emailVerified: true,
      email: "operator@tanki.local", firstName: "Operator", lastName: "Tanki",
    }),
  });
  const uid = (await (await fetch(`${A}/${REALM}/users?username=${TEST_USER}&exact=true`, { headers: H })).json())[0].id;
  await fetch(`${A}/${REALM}/users/${uid}/reset-password`, {
    method: "PUT", headers: HJ,
    body: JSON.stringify({ type: "password", value: TEST_PASS, temporary: false }),
  });
  const roleReps = [];
  for (const rn of TEST_ROLES) {
    roleReps.push(await (await fetch(`${A}/${REALM}/roles/${rn}`, { headers: H })).json());
  }
  r = await fetch(`${A}/${REALM}/users/${uid}/role-mappings/realm`, {
    method: "POST", headers: HJ, body: JSON.stringify(roleReps),
  });
  console.log(`user ${TEST_USER} roles: HTTP ${r.status}`);

  console.log("\n=== DONE (lokal) ===");
  console.log(`Issuer:               ${KC}/realms/${REALM}`);
  console.log(`AUTH_KEYCLOAK_ID:     tanki-jene`);
  console.log(`AUTH_KEYCLOAK_SECRET= ${secret}`);
  console.log(`Test login:           ${TEST_USER} / ${TEST_PASS}  (roles: ${TEST_ROLES.join(", ")})`);
}
main();
