/**
 * Blok E — Issue #7 (Medium), penanganan rahasia & kejujuran log audit.
 *
 * Memakai MySQL dan Mailpit sungguhan. Urutan kasus disengaja: keadaan
 * "tanpa SMTP" diuji lebih dulu, baru SMTP diarahkan ke Mailpit.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { getConfig, getSmtpConfig, setConfig } from "@/lib/tanki/config";
import { isEncrypted } from "@/lib/tanki/secret";
import { sendEmail, notifyOtp } from "@/lib/tanki/notify";

const MAILPIT = "http://localhost:8025";

async function mailpitBersihkan() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
}

async function mailpitPesan(): Promise<{ ID: string; Subject: string; To: { Address: string }[] }[]> {
  const r = await fetch(`${MAILPIT}/api/v1/messages`);
  const j = (await r.json()) as { messages?: unknown[] };
  return (j.messages ?? []) as { ID: string; Subject: string; To: { Address: string }[] }[];
}

async function mailpitIsi(id: string): Promise<string> {
  const r = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  const j = (await r.json()) as { Text?: string; HTML?: string };
  return `${j.Text ?? ""}\n${j.HTML ?? ""}`;
}

/** Baris log paling baru untuk sebuah tujuan. */
async function logTerakhir(tujuan: string) {
  const rows = await db.notifikasiLog.findMany({
    where: { tujuan },
    orderBy: { id: "desc" },
    take: 1,
  });
  return rows[0];
}

/** Nilai mentah di tabel — bukan hasil getConfig() yang sudah dimasking. */
async function nilaiMentah(key: string): Promise<string | null> {
  const rows = await db.$queryRawUnsafe<{ value: string }[]>(
    "SELECT `value` FROM konfigurasi WHERE `key` = ?",
    key,
  );
  return rows[0]?.value ?? null;
}

beforeAll(async () => {
  await mailpitBersihkan();
  // Mulai dari keadaan "SMTP belum dikonfigurasi".
  await setConfig({ smtp_host: "", smtp_pass: "" }, "uji-integrasi");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("E · rahasia & log audit (Issue #7)", () => {
  it("E3 — non-produksi tanpa SMTP: status_kirim = DILEWATI, bukan TERKIRIM", async () => {
    expect(await getSmtpConfig()).toBeNull();
    expect(process.env.NODE_ENV).not.toBe("production");

    const tujuan = "e3-dilewati@example.com";
    const hasil = await sendEmail({
      to: tujuan,
      subject: "uji jalur console",
      body: "isi",
      jenis: "TIKET",
    });

    expect(hasil.ok).toBe(true); // secara teknis tidak error
    const log = await logTerakhir(tujuan);
    expect(log.statusKirim).toBe("DILEWATI"); // tapi log audit jujur
    expect(log.statusKirim).not.toBe("TERKIRIM");
  });

  it("E5 — NODE_ENV=production tanpa SMTP: gagal terang-terangan, tercatat GAGAL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(await getSmtpConfig()).toBeNull();

      const tujuan = "e5-produksi@example.com";
      const hasil = await sendEmail({
        to: tujuan,
        subject: "uji produksi tanpa smtp",
        body: "isi",
        jenis: "TIKET",
      });

      expect(hasil.ok).toBe(false);
      expect(hasil.error).toMatch(/SMTP belum dikonfigurasi/);

      const log = await logTerakhir(tujuan);
      expect(log.statusKirim).toBe("GAGAL");
      expect(log.error).toMatch(/SMTP belum dikonfigurasi/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("E1 — smtp_pass tersimpan sebagai ciphertext, bukan cleartext", async () => {
    const RAHASIA = "SandiSmtpSangatRahasia123!";

    await setConfig(
      {
        smtp_host: "127.0.0.1",
        smtp_port: "1025",
        smtp_secure: "false",
        smtp_user: "tanki",
        smtp_pass: RAHASIA,
        smtp_from: "noreply@pdam-makassar.go.id",
      },
      "uji-integrasi",
    );

    const tersimpan = await nilaiMentah("smtp_pass");
    expect(tersimpan).not.toBeNull();
    expect(tersimpan).not.toBe(RAHASIA);
    expect(tersimpan).not.toContain(RAHASIA);
    expect(isEncrypted(tersimpan!)).toBe(true);

    // Tetap bisa dipakai: getSmtpConfig mendekripsi kembali ke nilai asli.
    const smtp = await getSmtpConfig();
    expect(smtp?.pass).toBe(RAHASIA);

    // Dan getConfig() — yang ikut ke Server Component — memasking habis.
    const cfg = await getConfig();
    expect(cfg.smtp_pass).toBe("");
  });

  it("E2 — email OTP di Mailpit: SUBJEK tidak memuat kode", async () => {
    await mailpitBersihkan();

    // Mailpit tanpa autentikasi; user/pass dikosongkan agar nodemailer tidak
    // mencoba AUTH yang tidak didukung.
    await setConfig({ smtp_user: "", smtp_pass: "" }, "uji-integrasi");

    const KODE = "246813";
    await notifyOtp("e2-otp@example.com", KODE, 10);

    // Beri jeda singkat supaya Mailpit selesai menerima.
    await new Promise((r) => setTimeout(r, 800));

    const pesan = await mailpitPesan();
    expect(pesan.length, "email OTP tidak sampai ke Mailpit").toBeGreaterThan(0);

    const otp = pesan.find((p) => p.To.some((t) => t.Address === "e2-otp@example.com"));
    expect(otp, "email OTP tidak ditemukan").toBeTruthy();

    // Inti item ini: subjeknya tidak boleh memuat kode.
    expect(otp!.Subject).not.toContain(KODE);
    expect(otp!.Subject).not.toMatch(/\d{6}/);

    // Kodenya memang harus ada — tapi di badan email, bukan subjek.
    const isi = await mailpitIsi(otp!.ID);
    expect(isi).toContain(KODE);

    const log = await logTerakhir("e2-otp@example.com");
    expect(log.statusKirim).toBe("TERKIRIM");
    expect(log.jenis).toBe("OTP");
  });

  it("E4 — email tes dari halaman konfigurasi tercatat jenis = TES", async () => {
    const tujuan = "e4-tes@example.com";
    await sendEmail({
      to: tujuan,
      subject: "Tes SMTP Tanki Je'ne'",
      body: "Ini email percobaan.",
      jenis: "TES",
    });

    const log = await logTerakhir(tujuan);
    expect(log.jenis).toBe("TES");
    expect(log.statusKirim).toBe("TERKIRIM");
    expect(log.tiketId).toBeNull(); // tidak mencemari log tiket
  });
});
