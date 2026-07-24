import type { Session } from "next-auth";

export type TankiRole =
  | "app-tanki"
  | "tanki-operator-crud"
  | "tanki-operator-readonly"
  | "tanki-admin";

export function getRoles(session: Session | null): string[] {
  return session?.user?.roles ?? [];
}

export function hasRole(session: Session | null, role: TankiRole): boolean {
  return getRoles(session).includes(role);
}

/** Boleh masuk aplikasi operator sama sekali. */
export function canAccessApp(session: Session | null): boolean {
  const roles = getRoles(session);
  return (
    roles.includes("app-tanki") ||
    roles.some((r) => r.startsWith("tanki-"))
  );
}

/** Punya hak ubah data (tiket, dispatch, master). */
export function canWrite(session: Session | null): boolean {
  return (
    hasRole(session, "tanki-operator-crud") || hasRole(session, "tanki-admin")
  );
}

/** Hanya boleh melihat (Direksi/monitoring). */
export function isReadOnly(session: Session | null): boolean {
  return hasRole(session, "tanki-operator-readonly") && !canWrite(session);
}

/** Boleh konfigurasi sistem (OTP, template, parameter). */
export function isAdmin(session: Session | null): boolean {
  return hasRole(session, "tanki-admin");
}
