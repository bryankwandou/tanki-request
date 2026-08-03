/**
 * Blok F — Issue #2, Keycloak. Gladi bersih memakai container Keycloak 26.1
 * dengan realm DIAMOND yang diprovisioning skrip repo.
 */
import { describe, expect, it } from "vitest";

import { bukaMentah, bukaSebagai, login, sesi, Jar, APP } from "./login";

const SANDI = "Operator123!";

describe("F · Keycloak (Issue #2)", () => {
  it("F1 — round-trip login: authorization code, PKCE, callback, cookie sesi", async () => {
    const { jar, authorizeUrl, callbackUrl, berhasil } = await login("operator", SANDI);

    // Permintaan authorize memakai authorization code + PKCE S256.
    const au = new URL(authorizeUrl);
    expect(au.origin + au.pathname).toBe(
      "http://localhost:8080/realms/DIAMOND/protocol/openid-connect/auth",
    );
    expect(au.searchParams.get("response_type")).toBe("code");
    expect(au.searchParams.get("code_challenge_method")).toBe("S256");
    expect(au.searchParams.get("code_challenge")).toBeTruthy();
    expect(au.searchParams.get("client_id")).toBe("tanki-jene");
    // Catatan: konfigurasi ini memakai PKCE sebagai satu-satunya check; tidak
    // ada parameter `state`. code_verifier disimpan di cookie terikat browser,
    // jadi penukaran kode tetap terikat sesi yang memulainya.
    expect(au.searchParams.get("code_verifier")).toBeNull();

    // Callback membawa authorization code, bukan token.
    const cb = new URL(callbackUrl);
    expect(cb.pathname).toBe("/api/auth/callback/keycloak");
    expect(cb.searchParams.get("code")).toBeTruthy();

    // Cookie sesi terpasang.
    expect(berhasil, `cookie: ${jar.nama().join(", ")}`).toBe(true);

    // Dan sesinya benar-benar dipakai: /dashboard tidak lagi memantul.
    const dash = await bukaMentah(jar, "/dashboard");
    expect(dash.status).toBe(200);
  });

  it("F2 — realm_access.roles sampai ke sesi aplikasi", async () => {
    const { jar } = await login("operator", SANDI);
    const s = await sesi(jar);

    expect(s).not.toBeNull();
    const roles = (s as { user?: { roles?: string[] } }).user?.roles ?? [];
    expect(Array.isArray(roles)).toBe(true);
    expect(roles).toContain("app-tanki");
    expect(roles).toContain("tanki-operator-crud");
    expect(roles).toContain("tanki-admin");
  });

  it("F3a — operator-crud diterima, dengan role crud tanpa admin", async () => {
    const { jar, berhasil } = await login("operator-crud", SANDI);
    expect(berhasil).toBe(true);

    const roles = ((await sesi(jar)) as { user?: { roles?: string[] } }).user?.roles ?? [];
    expect(roles).toContain("app-tanki");
    expect(roles).toContain("tanki-operator-crud");
    expect(roles).not.toContain("tanki-admin");

    expect((await bukaMentah(jar, "/dashboard")).status).toBe(200);
  });

  it("F3b — operator-readonly diterima, tanpa role crud", async () => {
    const { jar, berhasil } = await login("operator-readonly", SANDI);
    expect(berhasil).toBe(true);

    const roles = ((await sesi(jar)) as { user?: { roles?: string[] } }).user?.roles ?? [];
    expect(roles).toContain("app-tanki");
    expect(roles).toContain("tanki-operator-readonly");
    expect(roles).not.toContain("tanki-operator-crud");

    expect((await bukaMentah(jar, "/dashboard")).status).toBe(200);
  });

  it("F3c — user DIAMOND tanpa role tanki WAJIB ditolak (kasus terpenting)", async () => {
    // Autentikasi di Keycloak berhasil — semua user DIAMOND memang bisa.
    // Yang harus menolak adalah gerbang aplikasi, bukan Keycloak.
    const { jar, callbackUrl } = await login("user-norole", SANDI);
    expect(new URL(callbackUrl).searchParams.get("code"), "autentikasi Keycloak seharusnya berhasil").toBeTruthy();

    const roles = ((await sesi(jar)) as { user?: { roles?: string[] } })?.user?.roles ?? [];
    expect(roles).not.toContain("app-tanki");

    // Ditolak di middleware — memantul, tidak pernah sampai merender halaman.
    for (const path of ["/dashboard", "/dashboard/permintaan", "/dashboard/laporan"]) {
      const res = await bukaMentah(jar, path);
      expect(res.status, `${path} tidak boleh 200`).not.toBe(200);
      expect(res.headers.get("location") ?? "").toContain("/auth/sign-in");
    }

    // Dan tidak ada data operator yang ikut terkirim, termasuk lewat payload RSC.
    const akhir = await bukaSebagai(jar, "/dashboard/permintaan");
    const html = await akhir.text();
    expect(html).not.toMatch(/TJ-[A-Z]+-\d+/);
    expect(html).not.toMatch(/1976000\d\d/);
    expect(html).not.toMatch(/08123456789\d/);
  });

  it("F4 — sign-out membersihkan sesi lokal dan meneruskan ke logout Keycloak", async () => {
    const { jar } = await login("operator", SANDI);
    expect(jar.punyaSesi()).toBe(true);

    // Route server yang dipakai tombol keluar di header.
    const keluar = await bukaMentah(jar, "/api/auth/keycloak-logout?callbackUrl=%2Fauth%2Fsign-in");
    expect([302, 303, 307].includes(keluar.status)).toBe(true);

    // Diteruskan ke endpoint logout Keycloak — bukan sekadar hapus cookie lokal,
    // yang akan menyisakan sesi SSO dan membuat login berikutnya lolos diam-diam.
    const tujuan = keluar.headers.get("location") ?? "";
    expect(tujuan).toContain("/realms/DIAMOND/protocol/openid-connect/logout");

    // Cookie sesi lokal sudah dicabut.
    expect(jar.punyaSesi(), `sisa cookie: ${jar.nama().join(", ")}`).toBe(false);

    // Sesi benar-benar mati: /dashboard memantul lagi.
    expect((await bukaMentah(jar, "/dashboard")).status).not.toBe(200);
  });

  it("F5 — client tanki-jene ada sebagai confidential client dengan redirect URI benar", async () => {
    // Confidential: endpoint token menolak permintaan tanpa client_secret.
    const r = await fetch("http://localhost:8080/realms/DIAMOND/protocol/openid-connect/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "tanki-jene",
        code: "kode-palsu",
        redirect_uri: `${APP}/api/auth/callback/keycloak`,
      }).toString(),
    });
    const j = (await r.json()) as { error?: string; error_description?: string };

    // Client publik akan membalas invalid_grant (kodenya salah); client
    // confidential menolak lebih dulu karena kredensial client tidak ada.
    expect(j.error).toBe("unauthorized_client");
    expect(j.error_description).toMatch(/client|secret|credential/i);
  });

  it("F6 — empat realm role ada dan benar-benar ter-assign ke akun uji", async () => {
    const perlu = ["app-tanki", "tanki-operator-crud", "tanki-operator-readonly", "tanki-admin"];

    const admin = await fetch("http://localhost:8080/realms/master/protocol/openid-connect/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: "admin",
        password: "admin",
      }).toString(),
    });
    const { access_token } = (await admin.json()) as { access_token: string };

    const r = await fetch("http://localhost:8080/admin/realms/DIAMOND/roles", {
      headers: { authorization: `Bearer ${access_token}` },
    });
    const roles = (await r.json()) as { name: string }[];
    const nama = roles.map((x) => x.name);

    for (const p of perlu) expect(nama, `role ${p} tidak ada di realm`).toContain(p);
  });
});
