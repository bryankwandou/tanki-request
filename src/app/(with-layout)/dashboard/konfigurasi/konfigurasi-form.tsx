"use client";

import { saveKonfigurasi, testSmtp, type ActionState } from "./actions";
import { useActionState } from "react";

const initial: ActionState = { ok: false };
const cls =
  "w-full rounded-lg border border-stroke bg-transparent px-3 py-2 outline-none focus:border-primary dark:border-dark-3";

type Cfg = Record<string, string>;

export function KonfigurasiForm({ cfg, hasPass }: { cfg: Cfg; hasPass: boolean }) {
  const [s, save, saving] = useActionState(saveKonfigurasi, initial);
  const [ts, test, testing] = useActionState(testSmtp, initial);

  return (
    <div className="space-y-6">
      <form action={save} className="space-y-6">
        {/* SMTP */}
        <section className="rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark">
          <h2 className="mb-4 text-body-lg font-bold text-dark dark:text-white">SMTP / Email</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="SMTP Host" name="smtp_host" def={cfg.smtp_host} placeholder="smtp.gmail.com" />
            <Field label="Port" name="smtp_port" def={cfg.smtp_port} placeholder="587" />
            <Field label="Username" name="smtp_user" def={cfg.smtp_user} placeholder="user@domain" />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-dark-5 dark:text-dark-6">Password</span>
              <input
                name="smtp_pass"
                type="password"
                placeholder={hasPass ? "•••••• (biarkan kosong = tidak berubah)" : "(belum diatur)"}
                className={cls}
              />
            </label>
            <Field label="From (pengirim)" name="smtp_from" def={cfg.smtp_from} placeholder="noreply@pdam-makassar.go.id" />
            <label className="flex items-center gap-2 self-end text-sm">
              <input type="checkbox" name="smtp_secure" defaultChecked={cfg.smtp_secure === "true"} />
              <span className="text-dark dark:text-dark-6">Secure (TLS, port 465)</span>
            </label>
          </div>
        </section>

        {/* OTP + rate limit */}
        <section className="rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark">
          <h2 className="mb-4 text-body-lg font-bold text-dark dark:text-white">OTP Email &amp; Anti-spam</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex items-center gap-2 self-end text-sm">
              <input type="checkbox" name="otp_enabled" defaultChecked={cfg.otp_enabled === "true"} />
              <span className="text-dark dark:text-dark-6">Aktifkan OTP email</span>
            </label>
            <Field label="Masa berlaku OTP (menit, 1–60)" name="otp_ttl_minutes" def={cfg.otp_ttl_minutes} />
            <Field label="Panjang kode OTP (4–8)" name="otp_length" def={cfg.otp_length} />
            <Field
              label="Maks. percobaan salah per permintaan (3–10)"
              name="otp_max_attempts"
              def={cfg.otp_max_attempts}
            />
            <Field label="Maks. permintaan / jam / pelanggan (1–20)" name="rate_limit_per_hour" def={cfg.rate_limit_per_hour} />
          </div>
          <p className="mt-3 text-sm text-dark-5 dark:text-dark-6">
            Batas percobaan dihitung untuk seluruh umur satu permintaan dan{" "}
            <strong>tidak pulih saat pengguna meminta kode baru</strong>. Nilai di luar rentang
            yang tertulis akan disesuaikan otomatis ke batas terdekat saat disimpan.
          </p>
        </section>

        {/* Template email */}
        <section className="rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark">
          <h2 className="mb-1 text-body-lg font-bold text-dark dark:text-white">Template Email</h2>
          <p className="mb-4 text-sm text-dark-5 dark:text-dark-6">
            Placeholder yang tersedia: <code>{"{{kode}}"}</code> <code>{"{{ttl}}"}</code>{" "}
            <code>{"{{no_tiket}}"}</code> <code>{"{{status}}"}</code> <code>{"{{alasan}}"}</code>.
            Kosongkan sebuah kolom untuk mengembalikannya ke teks bawaan.
          </p>
          <div className="grid gap-4">
            <Field label="Subjek — OTP" name="tpl_otp_subject" def={cfg.tpl_otp_subject} />
            <TextArea label="Isi — OTP" name="tpl_otp_body" def={cfg.tpl_otp_body} />
            <Field label="Subjek — tiket dibuat" name="tpl_tiket_subject" def={cfg.tpl_tiket_subject} />
            <TextArea label="Isi — tiket dibuat" name="tpl_tiket_body" def={cfg.tpl_tiket_body} />
            <Field label="Subjek — perubahan status" name="tpl_status_subject" def={cfg.tpl_status_subject} />
            <TextArea label="Isi — perubahan status" name="tpl_status_body" def={cfg.tpl_status_body} />
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="rounded-lg bg-primary px-6 py-2.5 font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
            {saving ? "Menyimpan..." : "Simpan Konfigurasi"}
          </button>
          {s.error && <span className="text-sm text-red-dark">{s.error}</span>}
          {s.ok && <span className="text-sm text-green-dark">{s.message}</span>}
        </div>
      </form>

      {/* Test SMTP */}
      <form action={test} className="rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark">
        <h2 className="mb-3 text-body-lg font-bold text-dark dark:text-white">Tes Kirim Email</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-dark-5 dark:text-dark-6">Kirim email tes ke</span>
            <input name="testTo" type="email" required placeholder="anda@email.com" className={cls} />
          </label>
          <button type="submit" disabled={testing} className="rounded-lg border border-primary px-5 py-2 font-medium text-primary hover:bg-primary hover:text-white disabled:opacity-60">
            {testing ? "Mengirim..." : "Kirim Tes"}
          </button>
          {ts.error && <span className="text-sm text-red-dark">{ts.error}</span>}
          {ts.ok && <span className="text-sm text-green-dark">{ts.message}</span>}
        </div>
        <p className="mt-2 text-xs text-dark-5 dark:text-dark-6">
          Simpan konfigurasi dulu sebelum mengetes. Bila SMTP belum diisi, email hanya tercatat di log server.
        </p>
      </form>
    </div>
  );
}

function Field({ label, name, def, placeholder }: { label: string; name: string; def?: string; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-dark-5 dark:text-dark-6">{label}</span>
      <input name={name} defaultValue={def} placeholder={placeholder} className={cls} />
    </label>
  );
}

function TextArea({ label, name, def }: { label: string; name: string; def?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-dark-5 dark:text-dark-6">{label}</span>
      <textarea name={name} defaultValue={def} rows={4} className={`${cls} font-mono`} />
    </label>
  );
}
