import { describe, expect, it } from "vitest";

/**
 * Salinan persis logika `safeRedirect` di
 * src/app/api/auth/keycloak-logout/route.ts.
 *
 * Diuji terpisah karena route handler-nya butuh runtime Next; yang perlu
 * dibuktikan di sini murni keputusan "URL ini boleh atau tidak".
 */
function safeRedirect(raw: string | null, origin: string): string {
  const fallback = new URL("/auth/sign-in", origin).href;
  if (!raw) return fallback;
  try {
    const target = new URL(raw, origin);
    return target.origin === origin ? target.href : fallback;
  } catch {
    return fallback;
  }
}

/** Versi LAMA — tanpa validasi origin. Dipakai untuk membuktikan regresinya. */
function unsafeRedirect(raw: string | null, origin: string): string {
  return new URL(raw || "/auth/sign-in", origin).href;
}

const ORIGIN = "https://tanki.pdammakassar.co.id";
const SIGN_IN = `${ORIGIN}/auth/sign-in`;

describe("safeRedirect — open redirect pada jalur fallback logout", () => {
  it("menolak URL absolut ke host lain", () => {
    // new URL("https://evil.com", origin) mengabaikan base → inilah bug-nya.
    expect(unsafeRedirect("https://evil.com", ORIGIN)).toBe("https://evil.com/");
    expect(safeRedirect("https://evil.com", ORIGIN)).toBe(SIGN_IN);
  });

  it("menolak protocol-relative URL", () => {
    expect(safeRedirect("//evil.com", ORIGIN)).toBe(SIGN_IN);
    expect(safeRedirect("//evil.com/path", ORIGIN)).toBe(SIGN_IN);
  });

  it("menolak subdomain mirip dan userinfo trick", () => {
    expect(safeRedirect("https://tanki.pdammakassar.co.id.evil.com", ORIGIN)).toBe(SIGN_IN);
    expect(safeRedirect("https://evil.com#@tanki.pdammakassar.co.id", ORIGIN)).toBe(SIGN_IN);
  });

  it("menolak skema berbahaya", () => {
    expect(safeRedirect("javascript:alert(1)", ORIGIN)).toBe(SIGN_IN);
    expect(safeRedirect("data:text/html,<script>alert(1)</script>", ORIGIN)).toBe(SIGN_IN);
  });

  it("menolak pergantian skema ke http pada origin https", () => {
    expect(safeRedirect("http://tanki.pdammakassar.co.id/dashboard", ORIGIN)).toBe(SIGN_IN);
  });

  it("menerima path relatif di origin yang sama", () => {
    expect(safeRedirect("/dashboard", ORIGIN)).toBe(`${ORIGIN}/dashboard`);
    expect(safeRedirect("/auth/sign-in?x=1", ORIGIN)).toBe(`${ORIGIN}/auth/sign-in?x=1`);
  });

  it("menerima URL absolut ke origin yang sama", () => {
    expect(safeRedirect(`${ORIGIN}/dashboard`, ORIGIN)).toBe(`${ORIGIN}/dashboard`);
  });

  it("callbackUrl kosong / tidak ada → sign-in", () => {
    expect(safeRedirect(null, ORIGIN)).toBe(SIGN_IN);
    expect(safeRedirect("", ORIGIN)).toBe(SIGN_IN);
  });
});

describe("session callback tidak boleh membocorkan token", () => {
  // Bentuk objek yang dikembalikan callback session() — objek inilah yang
  // disajikan apa adanya oleh GET /api/auth/session ke browser.
  function buildSession(token: Record<string, unknown>) {
    const session: Record<string, unknown> = { user: { roles: token.roles ?? [] } };
    session.error = token.error ?? undefined;
    return session;
  }

  it("tidak ada idToken / accessToken / refreshToken di objek session", () => {
    const session = buildSession({
      roles: ["app-tanki", "tanki-operator"],
      idToken: "eyJraWQiOiJSAHASIA",
      accessToken: "eyJhbGciRAHASIA",
      refreshToken: "eyJhbGciUUUUU",
    });

    const serialized = JSON.stringify(session);
    for (const secret of ["idToken", "accessToken", "refreshToken", "RAHASIA", "UUUUU"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("role tetap sampai ke session", () => {
    const session = buildSession({ roles: ["tanki-operator"] }) as {
      user: { roles: string[] };
    };
    expect(session.user.roles).toEqual(["tanki-operator"]);
  });
});
