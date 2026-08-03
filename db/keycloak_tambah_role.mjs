// Tambah realm role Tanki Je'ne' yang belum ada — MINIMAL & NON-DESTRUKTIF.
//
// Dipakai saat verifikasi (db/keycloak_verifikasi.mjs) menemukan sebagian realm
// role belum ada di DIAMOND, tapi client `tanki-jene` TIDAK boleh disentuh.
//
// Bedanya dengan keycloak_setup_tanki_client.mjs: skrip itu men-drop lalu
// membuat ulang client, sehingga `client_secret` berganti dan sesi yang sedang
// berjalan terputus — tidak bisa dilakukan sembarang waktu pada realm yang
// dipakai bersama pdam-hrms dan pdam-hubungan-pelanggan.
//
// Skrip ini HANYA membuat realm role yang belum ada:
//   - tidak menyentuh client mana pun
//   - tidak mengubah role yang sudah ada (deskripsi sekalipun)
//   - tidak meng-assign role ke user siapa pun
//   - idempotent: role yang sudah ada dilewati
//
// Menambah realm role tidak memutus sesi dan tidak mengubah kredensial apa pun.
//
// Pakai:
//   KC_URL="https://diamond.pdammakassar.co.id/auth" \
//   KC_MASTER_USER="admin" KC_MASTER_PASS="<password>" \
//   node db/keycloak_tambah_role.mjs
//
//   DRY_RUN=1 -> hanya laporkan apa yang AKAN dibuat, tanpa menulis

if (process.env.KC_INSECURE === "1") process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const KC_URL = (process.env.KC_URL || "https://diamond.pdammakassar.co.id/auth").replace(/\/$/, "");
const KC_REALM = process.env.KC_REALM || "DIAMOND";
const KC_MASTER_USER = process.env.KC_MASTER_USER || "admin";
const KC_MASTER_PASS = process.env.KC_MASTER_PASS;
const DRY_RUN = process.env.DRY_RUN === "1";

const ROLES = [
  ["app-tanki", "Base role: boleh masuk aplikasi Tanki Je'ne'"],
  ["tanki-operator-crud", "Operator CRUD: kelola tiket, dispatch, master"],
  ["tanki-operator-readonly", "Read-only: lihat tiket/antrian/laporan (Direksi)"],
  ["tanki-admin", "Admin: konfigurasi OTP/template + hak CRUD"],
];

if (!KC_MASTER_PASS) {
  console.error("KC_MASTER_PASS wajib diisi lewat environment, bukan ditulis di skrip.");
  process.exit(2);
}

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
    console.error(`Tidak bisa mengambil token admin dari ${KC_URL} (HTTP ${r.status}).`);
    process.exit(2);
  }
  return (await r.json()).access_token;
}

async function main() {
  console.log(`Realm ${KC_REALM} di ${KC_URL}${DRY_RUN ? "  [DRY RUN — tidak menulis]" : ""}\n`);
  const tok = await adminToken();
  const H = { authorization: `Bearer ${tok}`, "content-type": "application/json" };

  const daftar = await (
    await fetch(`${KC_URL}/admin/realms/${KC_REALM}/roles?briefRepresentation=true&max=300`, {
      headers: H,
    })
  ).json();
  const ada = new Set(daftar.map((r) => r.name));

  let dibuat = 0;
  for (const [name, description] of ROLES) {
    if (ada.has(name)) {
      console.log(`  LEWAT  ${name} — sudah ada, tidak disentuh`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  AKAN   ${name} — belum ada, akan dibuat`);
      dibuat++;
      continue;
    }
    const r = await fetch(`${KC_URL}/admin/realms/${KC_REALM}/roles`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ name, description }),
    });
    if (r.status === 201 || r.status === 409) {
      console.log(`  BUAT   ${name} — HTTP ${r.status}`);
      dibuat++;
    } else {
      console.log(`  GAGAL  ${name} — HTTP ${r.status} ${await r.text()}`);
      process.exitCode = 1;
    }
  }

  console.log(
    `\n${dibuat === 0 ? "Tidak ada yang perlu dibuat." : `${dibuat} role ${DRY_RUN ? "akan dibuat" : "dibuat"}.`}`,
  );
  console.log("Client tidak disentuh sama sekali. Jalankan db/keycloak_verifikasi.mjs untuk memeriksa hasilnya.");
}

main().catch((e) => {
  console.error("Gagal:", e.message);
  process.exit(2);
});
