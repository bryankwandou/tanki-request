import { db } from "@/lib/db";
import { configNumber, getConfig } from "@/lib/tanki/config";
import { notifyTiketCreated } from "@/lib/tanki/notify";
import { genNoTiket } from "@/lib/tanki/no-tiket";
import { evaluateCooldown } from "@/lib/tanki/pengajuan-guard";
import { ACTIVE_STATUSES } from "@/lib/tanki/status";
import { verifikasiHp } from "@/lib/tanki/verifikasi-hp";

export type CreateTiketInput = {
  noPelanggan: string;
  noHp: string;
  email?: string | null;
  keluhan: string;
};

export type CreateTiketResult =
  | { ok: true; noTiket: string }
  | { ok: false; error: string };

export async function createTiket(
  input: CreateTiketInput,
): Promise<CreateTiketResult> {
  // 1. Validasi nomor pelanggan terhadap master (FR-02/FR-04).
  const pelanggan = await db.pelanggan.findUnique({
    where: { nosamb: input.noPelanggan },
  });
  if (!pelanggan) {
    return {
      ok: false,
      error: "Nomor Pelanggan tidak ditemukan pada data PDAM.",
    };
  }

  // 1b. Cocokkan No. HP dengan kontak terdaftar PDAM (butir 3.4).
  //
  // Inilah yang menutup "siapa pun yang tahu No. Pelanggan orang lain bisa
  // mengajukan atas nama mereka". Berlaku hanya untuk pelanggan yang kontaknya
  // SUDAH ada, kecuali admin menyalakan mode ketat — lihat verifikasi-hp.ts.
  const cfgHp = await getConfig();
  const kontak = await db.pelangganKontak.findUnique({
    where: { nosamb: input.noPelanggan },
    select: { noHp: true },
  });
  const hp = verifikasiHp(
    kontak?.noHp ?? null,
    input.noHp,
    cfgHp.verifikasi_hp_wajib === "true",
  );
  if (!hp.cocok) return { ok: false, error: hp.error };

  // 2. Cegah duplikasi permintaan aktif (FR-12).
  const aktif = await db.tiket.findFirst({
    where: {
      noPelanggan: input.noPelanggan,
      status: { in: [...ACTIVE_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (aktif) {
    return {
      ok: false,
      error: `Masih ada permintaan aktif (${aktif.noTiket}, status ${aktif.status}). Mohon tunggu hingga selesai.`,
    };
  }

  // 2b. Cooldown antar pengajuan (butir 3.4 laporan review).
  //
  // Guard di atas hanya berlaku selama tiket sebelumnya belum ditutup. Tanpa
  // cooldown, pelanggan yang tiketnya baru saja SELESAI bisa langsung mengantre
  // lagi, berulang kali sehari. Dihitung dari tiket TERAKHIR apa pun statusnya,
  // jadi membatalkan permintaan sendiri pun tidak mereset jatah.
  const cooldownJam = configNumber(await getConfig(), "submit_cooldown_hours");
  const terakhir = await db.tiket.findFirst({
    where: { noPelanggan: input.noPelanggan },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const cooldown = evaluateCooldown(terakhir?.createdAt ?? null, Date.now(), cooldownJam);
  if (!cooldown.allow) return { ok: false, error: cooldown.error };

  // 3. Buat tiket + riwayat awal dalam satu transaksi (FR-07).
  for (let attempt = 0; attempt < 5; attempt++) {
    const noTiket = genNoTiket();
    try {
      const created = await db.$transaction(async (tx) => {
        const tiket = await tx.tiket.create({
          data: {
            noTiket,
            noPelanggan: pelanggan.nosamb,
            namaSnapshot: pelanggan.nama,
            alamatSnapshot: pelanggan.alamat,
            wil: pelanggan.wil,
            koderayon: pelanggan.koderayon,
            noHp: input.noHp,
            email: input.email || null,
            keluhan: input.keluhan,
            status: "DITERIMA",
          },
        });
        await tx.tiketRiwayat.create({
          data: {
            tiketId: tiket.id,
            status: "DITERIMA",
            catatan: "Permintaan diterima sistem.",
            // Catatan sistem memang untuk dibaca pelapor (Issue #6).
            catatanPublik: true,
          },
        });
        return tiket;
      });
      await notifyTiketCreated({
        id: created.id,
        noTiket: created.noTiket,
        email: created.email,
        noHp: created.noHp,
      });
      return { ok: true, noTiket };
    } catch (e) {
      // Tabrakan no_tiket unik → coba lagi dengan nomor baru.
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("no_tiket") || msg.toLowerCase().includes("unique")) {
        continue;
      }
      throw e;
    }
  }

  return { ok: false, error: "Gagal membuat nomor tiket unik. Coba lagi." };
}
