"use server";

import { auth } from "@/lib/auth";
import { canWrite } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { STATUS_TEPERCAYA, catatKontakDariTiket } from "@/lib/tanki/kontak";
import { notifyStatusChange } from "@/lib/tanki/notify";
import {
  canTransition,
  REASON_REQUIRED,
  STATUS_LABEL,
} from "@/lib/tanki/status";
import type { StatusTiket } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";

export type ActionState = { ok: boolean; message?: string; error?: string };

export async function updateStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!canWrite(session)) {
    return { ok: false, error: "Anda tidak memiliki hak untuk mengubah status." };
  }

  const id = BigInt(String(formData.get("tiketId") ?? "0"));
  const newStatus = String(formData.get("newStatus") ?? "") as StatusTiket;
  const catatan = String(formData.get("catatan") ?? "").trim();
  /**
   * Penanda publik/internal (Issue #6). Checkbox tercentang secara default di
   * form, sehingga perilaku hari ini — alasan penolakan sampai ke pelapor —
   * tidak berubah. Operator yang butuh catatan internal cukup mencentangnya off.
   */
  const catatanPublik = formData.get("catatanPublik") !== null;

  if (!STATUS_LABEL[newStatus]) {
    return { ok: false, error: "Status tidak dikenal." };
  }
  if (REASON_REQUIRED.includes(newStatus) && catatan.length < 3) {
    return { ok: false, error: "Alasan wajib diisi untuk menolak/membatalkan." };
  }

  const tiket = await db.tiket.findUnique({ where: { id } });
  if (!tiket) return { ok: false, error: "Tiket tidak ditemukan." };

  if (!canTransition(tiket.status, newStatus)) {
    return {
      ok: false,
      error: `Transisi ${tiket.status} → ${newStatus} tidak diizinkan.`,
    };
  }

  const operatorId = session?.user?.email ?? null;
  const operatorNama = session?.user?.name ?? null;
  const releasing = newStatus === "SELESAI" || newStatus === "DIBATALKAN";

  await db.$transaction(async (tx) => {
    await tx.tiket.update({ where: { id }, data: { status: newStatus } });
    await tx.tiketRiwayat.create({
      data: {
        tiketId: id,
        status: newStatus,
        catatan: catatan || null,
        catatanPublik: Boolean(catatan) && catatanPublik,
        operatorId,
        operatorNama,
      },
    });

    // Bebaskan armada/sopir & tutup penugasan aktif bila tiket selesai/batal.
    if (releasing) {
      const aktif = await tx.penugasan.findFirst({
        where: { tiketId: id, status: { in: ["DIJADWALKAN", "BERANGKAT"] } },
      });
      if (aktif) {
        await tx.penugasan.update({
          where: { id: aktif.id },
          data: {
            status: newStatus === "SELESAI" ? "SELESAI" : "DIBATALKAN",
            jadwalSelesai: new Date(),
          },
        });
        await tx.kendaraan.update({
          where: { id: aktif.kendaraanId },
          data: { status: "TERSEDIA" },
        });
        await tx.sopir.update({
          where: { id: aktif.sopirId },
          data: { status: "TERSEDIA" },
        });
      }
    }
  });

  /**
   * Butir 3.4 — petugas baru saja menyatakan permintaan ini sah, jadi nomor HP
   * pelapornya layak dijadikan kontak terdaftar. Inilah yang membuat basis data
   * kontak terisi sendiri dari operasi sehari-hari, tanpa proyek pendataan
   * terpisah. Hanya mengisi yang masih kosong; tidak pernah menimpa.
   */
  if (STATUS_TEPERCAYA.includes(newStatus as (typeof STATUS_TEPERCAYA)[number])) {
    await catatKontakDariTiket(tiket.noPelanggan, tiket.noHp);
  }

  // Catatan internal tidak ikut ke email. Tanpa ini penandanya tidak ada artinya:
  // catatan disembunyikan di /lacak tapi tetap terkirim ke kotak masuk pelapor.
  await notifyStatusChange(
    { id: tiket.id, noTiket: tiket.noTiket, email: tiket.email },
    STATUS_LABEL[newStatus],
    catatanPublik ? catatan || null : null,
  );

  revalidatePath(`/dashboard/permintaan/${id}`);
  revalidatePath("/dashboard/permintaan");
  revalidatePath("/dashboard");
  return { ok: true, message: `Status diubah ke ${STATUS_LABEL[newStatus]}.` };
}
