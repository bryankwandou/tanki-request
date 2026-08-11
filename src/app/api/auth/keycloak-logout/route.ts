import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

/**
 * OIDC RP-Initiated Federated Logout ke Keycloak.
 *
 * Dua hal yang disengaja di sini:
 *
 * 1. `id_token` dibaca dari JWT di SISI SERVER lewat getToken(), bukan dari objek
 *    session. Apa pun yang dikembalikan callback `session()` juga disajikan oleh
 *    `GET /api/auth/session` dan bisa dibaca JavaScript klien mana pun — satu XSS
 *    cukup untuk mengambil token. Jadi token tidak boleh pernah keluar dari server.
 *
 * 2. Route ini melakukan REDIRECT, bukan mengembalikan `{ url }` untuk dieksekusi
 *    klien. Dengan begitu URL berisi `id_token_hint` tidak pernah sampai ke browser
 *    sebagai data, dan tidak ada jalur "klien menjalankan URL apa pun yang
 *    dikembalikan server" yang bisa dibelokkan.
 *
 * Urutannya sengaja: browser menuju ke sini SELAGI cookie sesi masih ada (supaya
 * `id_token_hint` bisa dibaca), lalu route ini yang menghapus cookie sesi pada
 * response redirect-nya. Kalau `signOut()` dijalankan lebih dulu, cookie sudah
 * hilang dan Keycloak akan menampilkan halaman konfirmasi logout karena tidak
 * menerima `id_token_hint`.
 */

/** Nama cookie sesi Auth.js, termasuk varian ter-chunk (`...token.0`, `.1`, ...). */
const SESSION_COOKIE_RE = /^(__Secure-)?authjs\.session-token(\.\d+)?$/;

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  // `callbackUrl` datang dari query string, jadi tidak boleh dipercaya.
  // `new URL("https://evil.com", origin)` mengabaikan base dan menghasilkan
  // https://evil.com/ — inilah open redirect-nya. Terima hanya tujuan yang
  // origin-nya sama dengan origin request ini.
  const safeRedirect = (raw: string | null): string => {
    const fallback = new URL("/auth/sign-in", origin).href;
    if (!raw) return fallback;
    try {
      const target = new URL(raw, origin);
      return target.origin === origin ? target.href : fallback;
    } catch {
      return fallback;
    }
  };

  const postLogoutRedirectUri = safeRedirect(req.nextUrl.searchParams.get("callbackUrl"));

  /** Redirect yang sekaligus menghapus sesi lokal, apa pun jalur keluarnya. */
  const redirectAndClearSession = (target: string) => {
    const res = NextResponse.redirect(target);
    for (const cookie of req.cookies.getAll()) {
      if (SESSION_COOKIE_RE.test(cookie.name)) {
        res.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
      }
    }
    return res;
  };

  const issuer = process.env.AUTH_KEYCLOAK_ISSUER;
  const clientId = process.env.AUTH_KEYCLOAK_ID;

  // Env salah konfigurasi (mis. di staging): jangan menebak URL Keycloak, cukup
  // pulangkan pengguna ke sign-in lokal — sesi lokal tetap dihapus.
  if (!issuer || !clientId) {
    return redirectAndClearSession(postLogoutRedirectUri);
  }

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: origin.startsWith("https://"),
  });

  const logoutUrl = new URL(`${issuer}/protocol/openid-connect/logout`);
  logoutUrl.searchParams.set("client_id", clientId);
  logoutUrl.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
  if (typeof token?.idToken === "string") {
    logoutUrl.searchParams.set("id_token_hint", token.idToken);
  }

  return redirectAndClearSession(logoutUrl.href);
}
