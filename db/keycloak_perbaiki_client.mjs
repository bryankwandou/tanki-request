// Perbaiki client `tanki-jene` menjadi CONFIDENTIAL + PKCE S256 — Issue #2.
//
// Kenapa skrip terpisah, bukan memakai keycloak_setup_tanki_client.mjs:
// skrip setup itu MENGHAPUS client yang sudah ada lalu membuatnya ulang. Di
// realm DIAMOND produksi itu tidak bisa diterima — menghapus client berarti
// mencabut seluruh sesi operator yang sedang berjalan dan menerbitkan secret
// baru, di realm yang juga dipakai pdam-hrms dan pdam-hubungan-pelanggan.
//
// Skrip ini hanya MENAMBAL, dengan PUT terhadap representasi client yang sudah
// ada dan hanya mengubah atribut yang memang salah:
//
//   publicClient               true  -> false   (wajib client secret)
//   pkce.code.challenge.method (kosong) -> S256 (wajib PKCE)
//   implicitFlowEnabled        true  -> false   (alur lawas, token di URL)
//   directAccessGrantsEnabled  true  -> false   (password grant, tidak dipakai)
//
// redirectUris, webOrigins, role, mapper, dan sesi TIDAK disentuh.
//
// Pakai (jalankan sebagai admin realm):
//   KC_URL=https://diamond.pdammakassar.co.id/auth \
//   KC_MASTER_USER=... KC_MASTER_PASS=... \
//   node db/keycloak_perbaiki_client.mjs
//
//   --dry-run   tampilkan apa yang AKAN diubah, tanpa menulis apa pun
//
// Env: KC_URL, KC_REALM, KC_MASTER_USER, KC_MASTER_PASS, KC_CLIENT_ID
//      KC_INSECURE=1 -> lewati verifikasi TLS (hanya bila cert self-signed)
//
// Keluar 0 bila client sudah/berhasil menjadi confidential+PKCE, 1 bila gagal.
// Aman dijalankan berulang kali: kalau sudah benar, ia tidak menulis apa pun.

if (process.env.KC_INSECURE === "1") process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const KC_URL = (process.env.KC_URL || "https://diamond.pdammakassar.co.id/auth").replace(/\/$/, "");
const KC_REALM = process.env.KC_REALM || "DIAMOND";
const KC_MASTER_USER = process.env.KC_MASTER_USER || "admin";
const KC_MASTER_PASS = process.env.KC_MASTER_PASS || "admin";
const KC_CLIENT_ID = process.env.KC_CLIENT_ID || "tanki-jene";
const DRY_RUN = process.argv.includes("--dry-run");

const die = (m) => {
  console.error(`GAGAL: ${m}`);
  process.exit(1);
};

async function main() {
  console.log(`Realm  : ${KC_REALM} @ ${KC_URL}`);
  console.log(`Client : ${KC_CLIENT_ID}`);
  console.log(DRY_RUN ? "Mode   : DRY RUN (tidak menulis apa pun)\n" : "Mode   : TULIS\n");

  const tokRes = await fetch(`${KC_URL}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: KC_MASTER_USER,
      password: KC_MASTER_PASS,
    }),
  });
  if (!tokRes.ok) die(`login admin gagal: HTTP ${tokRes.status}`);
  const TOKEN = (await tokRes.json()).access_token;
  if (!TOKEN) die("tidak ada access_token");

  const ADMIN = `${KC_URL}/admin/realms/${KC_REALM}`;
  const auth = { Authorization: `Bearer ${TOKEN}` };
  const authJson = { ...auth, "Content-Type": "application/json" };

  const res = await fetch(`${ADMIN}/clients?clientId=${encodeURIComponent(KC_CLIENT_ID)}`, {
    headers: auth,
  });
  if (!res.ok) die(`tidak bisa membaca daftar client: HTTP ${res.status}`);
  const client = (await res.json())[0];
  if (!client) die(`client '${KC_CLIENT_ID}' tidak ada di realm ${KC_REALM}`);

  const perubahan = [];
  if (client.publicClient === true) perubahan.push("publicClient: true -> false");
  if (client.attributes?.["pkce.code.challenge.method"] !== "S256")
    perubahan.push(
      `pkce.code.challenge.method: ${client.attributes?.["pkce.code.challenge.method"] ?? "(kosong)"} -> S256`,
    );
  if (client.implicitFlowEnabled === true) perubahan.push("implicitFlowEnabled: true -> false");
  if (client.directAccessGrantsEnabled === true)
    perubahan.push("directAccessGrantsEnabled: true -> false");

  if (perubahan.length === 0) {
    console.log("Sudah benar: confidential, PKCE S256, tanpa implicit/password grant.");
    console.log("Tidak ada yang diubah.");
    return;
  }

  console.log("Yang akan diubah:");
  for (const p of perubahan) console.log(`  - ${p}`);

  if (DRY_RUN) {
    console.log("\nDRY RUN — tidak ada yang ditulis.");
    process.exit(0);
  }

  // PUT representasi LENGKAP yang sudah ada, dengan hanya field bermasalah
  // yang diganti. Mengirim objek parsial akan membuat Keycloak mengosongkan
  // field yang tidak disebut — termasuk redirectUris.
  const baru = {
    ...client,
    publicClient: false,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    attributes: {
      ...(client.attributes ?? {}),
      "pkce.code.challenge.method": "S256",
    },
  };

  const put = await fetch(`${ADMIN}/clients/${client.id}`, {
    method: "PUT",
    headers: authJson,
    body: JSON.stringify(baru),
  });
  if (!put.ok) die(`gagal menyimpan perubahan: HTTP ${put.status}`);
  console.log("\nTersimpan.");

  // Client yang baru berubah dari public ke confidential belum tentu punya
  // secret; minta Keycloak menerbitkannya bila kosong.
  const secRes = await fetch(`${ADMIN}/clients/${client.id}/client-secret`, { headers: auth });
  let secret = secRes.ok ? (await secRes.json()).value : null;
  if (!secret) {
    const gen = await fetch(`${ADMIN}/clients/${client.id}/client-secret`, {
      method: "POST",
      headers: auth,
    });
    secret = gen.ok ? (await gen.json()).value : null;
  }

  if (secret) {
    console.log("\nIsi ke .env aplikasi (JANGAN di-commit):");
    console.log(`AUTH_KEYCLOAK_SECRET=${secret}`);
  } else {
    console.log(
      "\nPERINGATAN: secret tidak bisa dibaca. Ambil manual dari Admin Console " +
        "→ Clients → tanki-jene → Credentials.",
    );
  }

  console.log("\nVerifikasi ulang dengan: node db/keycloak_verifikasi.mjs");
}

main().catch((e) => die(e?.message ?? String(e)));
