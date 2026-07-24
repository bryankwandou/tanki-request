import { Card, PageHeader } from "@/components/tanki/ui";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth/roles";
import { getConfig } from "@/lib/tanki/config";
import type { Metadata } from "next";
import { KonfigurasiForm } from "./konfigurasi-form";

export const metadata: Metadata = { title: "Konfigurasi" };
export const dynamic = "force-dynamic";

export default async function KonfigurasiPage() {
  const session = await auth();

  if (!isAdmin(session)) {
    return (
      <Card>
        <h2 className="mb-2 text-heading-6 font-bold text-dark dark:text-white">
          Khusus Admin
        </h2>
        <p className="text-dark-5 dark:text-dark-6">
          Halaman konfigurasi hanya untuk role <code>tanki-admin</code>.
        </p>
      </Card>
    );
  }

  const cfg = await getConfig();
  const hasPass = Boolean(cfg.smtp_pass);
  // Jangan kirim password ke client.
  const safeCfg: Record<string, string> = { ...cfg };
  delete safeCfg.smtp_pass;

  return (
    <>
      <PageHeader
        title="Konfigurasi Sistem"
        description="Pengaturan SMTP/email, OTP, dan parameter anti-spam (FR-29..32)."
      />
      <KonfigurasiForm cfg={safeCfg} hasPass={hasPass} />
    </>
  );
}
