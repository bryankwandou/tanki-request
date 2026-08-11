import { Card, PageHeader } from "@/components/tanki/ui";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth/roles";
import { getConfig, hasStoredSecret } from "@/lib/tanki/config";
import { isEncryptionConfigured } from "@/lib/tanki/secret";
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

  // getConfig() sudah mengosongkan nilai rahasia, jadi payload RSC ke browser
  // tidak pernah memuat password SMTP. Keberadaannya ditanyakan terpisah.
  const cfg = await getConfig();
  const hasPass = await hasStoredSecret("smtp_pass");
  const hasWaToken = await hasStoredSecret("wa_api_token");
  const smtpBelumDiisi = !cfg.smtp_host;
  const kunciBelumDiset = !isEncryptionConfigured();

  return (
    <>
      <PageHeader
        title="Konfigurasi Sistem"
        description="Pengaturan SMTP/email, OTP, dan parameter anti-spam (FR-29..32)."
      />

      {smtpBelumDiisi && (
        <div className="mb-6 rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-200">
          <strong>SMTP belum dikonfigurasi.</strong> Di produksi, sistem tidak akan
          mengirim email apa pun — termasuk kode OTP — sampai host SMTP di bawah
          diisi. Setiap percobaan kirim dicatat sebagai gagal di log notifikasi.
        </div>
      )}

      {kunciBelumDiset && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200">
          <strong>CONFIG_ENCRYPTION_KEY belum diset.</strong> Password SMTP tidak
          bisa disimpan karena tidak ada kunci untuk mengenkripsinya. Buat kunci
          dengan <code>openssl rand -base64 32</code>, isikan ke environment, lalu
          restart aplikasi.
        </div>
      )}

      <KonfigurasiForm cfg={cfg} hasPass={hasPass} hasWaToken={hasWaToken} />
    </>
  );
}
