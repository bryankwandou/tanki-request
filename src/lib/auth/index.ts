import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Keycloak from "next-auth/providers/keycloak";

/** Diagnostik login hanya aktif bila diminta — lihat authDiag(). */
const AUTH_DEBUG = process.env.AUTH_DEBUG === "1";

/**
 * Log diagnostik untuk jalur SUKSES. Dipagari flag karena identitas operator
 * (username/email) tidak boleh tercatat di log setiap kali login — postur yang
 * sama dengan Issue #7 soal kode OTP yang tertulis ke console.
 * Log untuk jalur GAGAL tidak dipagari: itu justru yang diminta Issue #2, dan
 * isinya tidak menyertakan identitas.
 */
function authDiag(...args: unknown[]) {
  if (AUTH_DEBUG) console.info("[AUTH DIAGNOSTIC]", ...args);
}

/** Segmen JWT dikodekan base64url (`-`/`_`, tanpa padding), bukan base64 biasa. */
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    throw new Error("Format access_token tidak memenuhi standar struktur JWT 3-bagian");
  }
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
}

/** Hanya role yang relevan dengan aplikasi ini yang disimpan ke sesi. */
function filterTankiRoles(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((r): r is string => typeof r === "string" && (r === "app-tanki" || r.startsWith("tanki-")));
}

/**
 * Single-flight refresh.
 *
 * Callback jwt() jalan per request. Kalau beberapa request operator datang
 * bersamaan saat token mendekati kedaluwarsa, semuanya akan POST ke endpoint
 * token dengan refresh token yang sama. Keycloak dengan refresh token rotation
 * aktif menginvalidasi refresh token lama begitu yang pertama sukses, sehingga
 * sisanya dapat `invalid_grant` → RefreshTokenError → operator terlempar ke
 * halaman login di tengah kerja.
 *
 * Map di bawah menahan Promise refresh yang sedang berjalan, di-key oleh refresh
 * token, supaya request konkuren ikut menunggu hasil yang sama.
 */
const inFlightRefresh = new Map<string, Promise<JWT>>();

async function refreshKeycloakTokenOnce(token: JWT): Promise<JWT> {
  const key = token.refreshToken;
  if (typeof key !== "string" || !key) return refreshKeycloakToken(token);

  const existing = inFlightRefresh.get(key);
  if (existing) return existing;

  const pending = refreshKeycloakToken(token).finally(() => {
    inFlightRefresh.delete(key);
  });
  inFlightRefresh.set(key, pending);
  return pending;
}

/**
 * Memperbarui access_token dari Keycloak jika token saat ini mendekati kedaluwarsa.
 */
async function refreshKeycloakToken(token: JWT): Promise<JWT> {
  try {
    const issuer = process.env.AUTH_KEYCLOAK_ISSUER;
    const clientId = process.env.AUTH_KEYCLOAK_ID;
    const clientSecret = process.env.AUTH_KEYCLOAK_SECRET;

    if (!issuer || !clientId || !clientSecret || !token.refreshToken) {
      console.warn(
        "[AUTH DIAGNOSTIC] Gagal membarui token: kredensial Keycloak atau refreshToken tidak tersedia.",
      );
      return { ...token, error: "RefreshTokenError" };
    }

    const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: token.refreshToken as string,
      }),
    });

    const refreshedTokens = await response.json();

    if (!response.ok) {
      console.error(
        "[AUTH DIAGNOSTIC] Gagal memperbarui access_token Keycloak. HTTP status:",
        response.status,
        refreshedTokens,
      );
      return { ...token, error: "RefreshTokenError" };
    }

    let updatedRoles = token.roles ?? [];
    if (refreshedTokens.access_token) {
      try {
        const payload = decodeJwtPayload(refreshedTokens.access_token);
        const roles = filterTankiRoles(
          (payload?.realm_access as { roles?: unknown } | undefined)?.roles,
        );
        if (roles) updatedRoles = roles;
      } catch (error) {
        console.error(
          "[AUTH DIAGNOSTIC] Gagal mendekode realm roles pada refreshed access_token:",
          error,
        );
      }
    }

    const expiresAt =
      refreshedTokens.expires_at ??
      Math.floor(Date.now() / 1000 + (refreshedTokens.expires_in ?? 300));

    authDiag("Token Keycloak berhasil diperbarui untuk sesi operator.");

    return {
      ...token,
      accessToken: refreshedTokens.access_token ?? token.accessToken,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
      idToken: refreshedTokens.id_token ?? token.idToken,
      expiresAt,
      roles: updatedRoles,
      error: undefined,
    };
  } catch (error) {
    console.error("[AUTH DIAGNOSTIC] Kesalahan fatal pada pembaruan token Keycloak:", error);
    return { ...token, error: "RefreshTokenError" };
  }
}

/**
 * Auth.js (NextAuth v5) + Keycloak — menggantikan better-auth bawaan template.
 * Reuse instance Keycloak terpusat realm DIAMOND; client `tanki-jene`
 * (confidential: Auth.js menukar authorization code di sisi server, PKCE aktif).
 * Realm role tidak ada di id_token secara default — kita baca dari access_token.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET,
      issuer: process.env.AUTH_KEYCLOAK_ISSUER,
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/sign-in",
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.idToken = account.id_token;
        token.expiresAt =
          account.expires_at ??
          Math.floor(Date.now() / 1000 + (account.expires_in ?? 300));

        if (account.access_token) {
          try {
            const payload = decodeJwtPayload(account.access_token);
            const roles = filterTankiRoles(
              (payload?.realm_access as { roles?: unknown } | undefined)?.roles,
            );

            if (roles === null) {
              // Jalur GAGAL — tidak dipagari flag, dan tanpa identitas operator.
              console.warn(
                "[AUTH DIAGNOSTIC] realm_access.roles tidak ditemukan di dalam access_token. Periksa konfigurasi mapper client scope pada Keycloak.",
              );
              token.roles = [];
            } else {
              token.roles = roles;
              // Role saja, tanpa username/email — lihat catatan di authDiag().
              authDiag("Login sukses. Roles terotentikasi:", roles);
            }
          } catch (error) {
            console.error(
              "[AUTH DIAGNOSTIC] Gagal mendekode atau memparsing struktur access_token dari Keycloak:",
              error,
            );
            token.roles = [];
          }
        } else {
          console.warn(
            "[AUTH DIAGNOSTIC] Autentikasi dari Keycloak tidak menyertakan access_token.",
          );
          token.roles = [];
        }
        return token;
      }

      const expiresAt = (token.expiresAt as number) ?? 0;
      if (Math.floor(Date.now() / 1000) < expiresAt - 60) {
        return token;
      }

      return await refreshKeycloakTokenOnce(token);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.roles = (token.roles as string[]) ?? [];
      }
      // idToken SENGAJA tidak dimasukkan ke session. Apa pun yang dikembalikan
      // callback ini disajikan oleh GET /api/auth/session dan terbaca JavaScript
      // klien mana pun. Federated logout membacanya dari JWT di sisi server —
      // lihat src/app/api/auth/keycloak-logout/route.ts.
      session.error = (token.error as string) ?? undefined;
      return session;
    },
  },
});
