// Tambah user uji ke realm DIAMOND (Keycloak lokal) TANPA menyentuh client/secret.
// Pakai: node db/keycloak_add_users.mjs

const KC = process.env.KC_URL || "http://localhost:8080";
const ADMIN_USER = process.env.KC_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.KC_ADMIN_PASS || "admin";
const REALM = "DIAMOND";

const USERS = [
  { username: "direksi", password: "Direksi123!", email: "direksi@tanki.local", roles: ["app-tanki", "tanki-operator-readonly"] },
  { username: "petugas", password: "Petugas123!", email: "petugas@tanki.local", roles: ["app-tanki", "tanki-operator-crud"] },
];

const die = (m) => { console.error("ERROR:", m); process.exit(1); };

async function main() {
  const tr = await fetch(`${KC}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", client_id: "admin-cli", username: ADMIN_USER, password: ADMIN_PASS }),
  }).catch((e) => die("token: " + e.message));
  if (!tr.ok) die(`token HTTP ${tr.status}`);
  const TOKEN = (await tr.json()).access_token;
  const H = { Authorization: `Bearer ${TOKEN}` };
  const HJ = { ...H, "Content-Type": "application/json" };
  const A = `${KC}/admin/realms/${REALM}`;

  for (const u of USERS) {
    await fetch(`${A}/users`, {
      method: "POST", headers: HJ,
      body: JSON.stringify({ username: u.username, enabled: true, emailVerified: true, email: u.email, firstName: u.username }),
    });
    const uid = (await (await fetch(`${A}/users?username=${u.username}&exact=true`, { headers: H })).json())[0].id;
    await fetch(`${A}/users/${uid}/reset-password`, {
      method: "PUT", headers: HJ,
      body: JSON.stringify({ type: "password", value: u.password, temporary: false }),
    });
    const reps = [];
    for (const rn of u.roles) reps.push(await (await fetch(`${A}/roles/${rn}`, { headers: H })).json());
    const r = await fetch(`${A}/users/${uid}/role-mappings/realm`, { method: "POST", headers: HJ, body: JSON.stringify(reps) });
    console.log(`user ${u.username} (${u.roles.join(", ")}): HTTP ${r.status}`);
  }
  console.log("\nLogin uji:");
  for (const u of USERS) console.log(`  ${u.username} / ${u.password}  → ${u.roles.join(", ")}`);
}
main();
