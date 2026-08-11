import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      roles: string[];
    } & DefaultSession["user"];
    // Tidak ada idToken di sini — objek Session disajikan apa adanya oleh
    // GET /api/auth/session, jadi token tidak boleh sampai ke browser.
    // Federated logout membacanya dari JWT di sisi server.
    error?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    roles?: string[];
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    expiresAt?: number;
    error?: string;
  }
}
