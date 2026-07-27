import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Keycloak from "next-auth/providers/keycloak";

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
        const tokenParts = refreshedTokens.access_token.split(".");
        if (tokenParts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(tokenParts[1], "base64").toString("utf-8"),
          );
          const rawRoles = payload?.realm_access?.roles;
          if (Array.isArray(rawRoles)) {
            updatedRoles = rawRoles.filter(
              (r) => r === "app-tanki" || r.startsWith("tanki-"),
            );
          }
        }
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

    console.info("[AUTH DIAGNOSTIC] Token Keycloak berhasil diperbarui untuk sesi operator.");

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
            const tokenParts = account.access_token.split(".");
            if (tokenParts.length !== 3) {
              throw new Error(
                "Format access_token tidak memenuhi standar struktur JWT 3-bagian",
              );
            }
            const payload = JSON.parse(
              Buffer.from(tokenParts[1], "base64").toString("utf-8"),
            );
            const rawRoles = payload?.realm_access?.roles;

            if (!Array.isArray(rawRoles)) {
              console.warn(
                "[AUTH DIAGNOSTIC] realm_access.roles tidak ditemukan di dalam access_token. Periksa konfigurasi mapper client scope pada Keycloak.",
              );
              token.roles = [];
            } else {
              token.roles = rawRoles.filter(
                (r) => r === "app-tanki" || r.startsWith("tanki-"),
              );
              console.info(
                `[AUTH DIAGNOSTIC] Login sukses untuk akun: ${payload.preferred_username || payload.email || "Operator"} | Roles terotentikasi: ${JSON.stringify(token.roles)}`,
              );
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

      return await refreshKeycloakToken(token);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.roles = (token.roles as string[]) ?? [];
      }
      session.idToken = (token.idToken as string) ?? undefined;
      session.error = (token.error as string) ?? undefined;
      return session;
    },
  },
});
