import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";

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
      if (account?.access_token) {
        try {
          const payload = JSON.parse(
            Buffer.from(account.access_token.split(".")[1], "base64").toString(),
          );
          const roles: string[] = payload?.realm_access?.roles ?? [];
          token.roles = roles.filter(
            (r) => r === "app-tanki" || r.startsWith("tanki-"),
          );
        } catch {
          token.roles = [];
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.roles = (token.roles as string[]) ?? [];
      }
      return session;
    },
  },
});
