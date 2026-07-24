import { db } from "@/lib/db";

// Kunci konfigurasi sistem + default. Disimpan di tabel `konfigurasi` (key/value string).
export const CONFIG_DEFAULTS = {
  smtp_host: "",
  smtp_port: "587",
  smtp_secure: "false", // "true" untuk port 465
  smtp_user: "",
  smtp_pass: "", // rahasia — tidak pernah dikirim balik ke UI
  smtp_from: "noreply@pdam-makassar.go.id",
  otp_enabled: "true", // OTP email = pertahanan utama validasi laporan
  otp_ttl_minutes: "10",
  otp_length: "6",
  rate_limit_per_hour: "3",
} as const;

export type ConfigKey = keyof typeof CONFIG_DEFAULTS;
export const SECRET_KEYS: ConfigKey[] = ["smtp_pass"];

export async function getConfig(): Promise<Record<ConfigKey, string>> {
  const rows = await db.konfigurasi.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = { ...CONFIG_DEFAULTS } as Record<ConfigKey, string>;
  for (const k of Object.keys(CONFIG_DEFAULTS) as ConfigKey[]) {
    if (map[k] !== undefined) out[k] = map[k];
  }
  return out;
}

export async function setConfig(
  entries: Partial<Record<ConfigKey, string>>,
  updatedBy?: string | null,
) {
  const keys = Object.keys(entries) as ConfigKey[];
  await db.$transaction(
    keys.map((key) =>
      db.konfigurasi.upsert({
        where: { key },
        create: { key, value: entries[key] ?? "", updatedBy: updatedBy ?? null },
        update: { value: entries[key] ?? "", updatedBy: updatedBy ?? null },
      }),
    ),
  );
}

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const c = await getConfig();
  if (!c.smtp_host) return null;
  return {
    host: c.smtp_host,
    port: Number(c.smtp_port) || 587,
    secure: c.smtp_secure === "true",
    user: c.smtp_user || undefined,
    pass: c.smtp_pass || undefined,
    from: c.smtp_from || "noreply@pdam-makassar.go.id",
  };
}
