"use server";

import { auth } from "@/lib/auth";
import { canWrite } from "@/lib/auth/roles";
import { db } from "@/lib/db";
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

  await notifyStatusChange(
    { id: tiket.id, noTiket: tiket.noTiket, email: tiket.email },
    STATUS_LABEL[newStatus],
    catatan || null,
  );

  revalidatePath(`/dashboard/permintaan/${id}`);
  revalidatePath("/dashboard/permintaan");
  revalidatePath("/dashboard");
  return { ok: true, message: `Status diubah ke ${STATUS_LABEL[newStatus]}.` };
}
