import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Endpoint untuk mendukung OIDC RP-Initiated Federated Logout dengan Keycloak.
 * Mengembalikan tautan logout Keycloak lengkap dengan client_id, id_token_hint,
 * dan post_logout_redirect_uri agar sesi SSO Keycloak ditutup sepenuhnya.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const issuer = process.env.AUTH_KEYCLOAK_ISSUER;
  const clientId = process.env.AUTH_KEYCLOAK_ID;

  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl") || "/auth/sign-in";
  const postLogoutRedirectUri = new URL(callbackUrl, req.nextUrl.origin).href;

  if (!issuer || !clientId) {
    return NextResponse.json({ url: postLogoutRedirectUri }, { status: 200 });
  }

  let logoutUrl = `${issuer}/protocol/openid-connect/logout?client_id=${encodeURIComponent(clientId)}&post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}`;
  if (session?.idToken) {
    logoutUrl += `&id_token_hint=${encodeURIComponent(session.idToken)}`;
  }

  return NextResponse.json({ url: logoutUrl }, { status: 200 });
}
