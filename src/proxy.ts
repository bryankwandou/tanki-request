import { auth } from "@/lib/auth";

/**
 * Next.js 16 menamai middleware sebagai `proxy.ts`.
 * Hanya area operator (/dashboard/*) yang diproteksi; portal publik (/ , /lacak)
 * tetap terbuka tanpa login.
 */
export default auth((req) => {
  const isOperatorArea = req.nextUrl.pathname.startsWith("/dashboard");

  if (isOperatorArea && (!req.auth || req.auth.error === "RefreshTokenError")) {
    const signInUrl = new URL("/auth/sign-in", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
