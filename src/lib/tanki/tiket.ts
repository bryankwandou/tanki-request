import { db } from "@/lib/db";
import { ACTIVE_STATUSES } from "@/lib/tanki/status";
import { notifyTiketCreated } from "@/lib/tanki/notify";

export type CreateTiketInput = {
  noPelanggan: string;
  noHp: string;
  email?: string | null;
  keluhan: string;
};

export type CreateTiketResult =
  | { ok: true; noTiket: string }
  | { ok: false; error: string };

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function genNoTiket(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rand = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(4, "0");
  return `TJ-${ymd}-${rand}`;
}

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
