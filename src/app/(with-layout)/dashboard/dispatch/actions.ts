"use server";

import { auth } from "@/lib/auth";
import { canWrite } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { notifyStatusChange } from "@/lib/tanki/notify";
import { STATUS_LABEL } from "@/lib/tanki/status";
import { revalidatePath } from "next/cache";

export type ActionState = { ok: boolean; message?: string; error?: string };

async function requireWrite() {
  const session = await auth();
  if (!canWrite(session)) return null;
  return session;
}

export async function createKendaraan(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!(await requireWrite())) return { ok: false, error: "Tidak punya hak ubah." };
  const nopol = String(fd.get("nopol") ?? "").trim().toUpperCase();
  const merk = String(fd.get("merk") ?? "").trim();
  const kap = String(fd.get("kapasitasLiter") ?? "").trim();
  if (!nopol) return { ok: false, error: "No. Polisi wajib diisi." };
  try {
    await db.kendaraan.create({
      data: {
        nopol,
        merk: merk || null,
        kapasitasLiter: kap ? Number(kap) : null,
      },
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes("nopol") || m.toLowerCase().includes("unique"))
      return { ok: false, error: `No. Polisi ${nopol} sudah terdaftar.` };
    throw e;
  }
  revalidatePath("/dashboard/dispatch/kendaraan");
  return { ok: true, message: `Kendaraan ${nopol} ditambahkan.` };
}

export async function createSopir(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!(await requireWrite())) return { ok: false, error: "Tidak punya hak ubah." };
  const nama = String(fd.get("nama") ?? "").trim();
  const noHp = String(fd.get("noHp") ?? "").trim();
  if (!nama) return { ok: false, error: "Nama sopir wajib diisi." };
  await db.sopir.create({ data: { nama, noHp: noHp || null } });
  revalidatePath("/dashboard/dispatch/sopir");
  return { ok: true, message: `Sopir ${nama} ditambahkan.` };
}

export async function createPenugasan(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const session = await requireWrite();
  if (!session) return { ok: false, error: "Tidak punya hak ubah." };

  const tiketId = BigInt(String(fd.get("tiketId") ?? "0"));
  const kendaraanId = BigInt(String(fd.get("kendaraanId") ?? "0"));
  const sopirId = BigInt(String(fd.get("sopirId") ?? "0"));
  const jadwalRaw = String(fd.get("jadwalMulai") ?? "").trim();
  if (!tiketId || !kendaraanId || !sopirId || !jadwalRaw) {
    return { ok: false, error: "Tiket, kendaraan, sopir, dan jadwal wajib diisi." };
  }
  const jadwalMulai = new Date(jadwalRaw);
  if (isNaN(jadwalMulai.getTime())) return { ok: false, error: "Jadwal tidak valid." };

  const tiket = await db.tiket.findUnique({ where: { id: tiketId } });
  if (!tiket) return { ok: false, error: "Tiket tidak ditemukan." };
  if (!["DITERIMA", "TERVERIFIKASI"].includes(tiket.status)) {
    return { ok: false, error: `Tiket berstatus ${tiket.status} tidak bisa dijadwalkan.` };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.penugasan.create({
        data: {
          tiketId,
          kendaraanId,
          sopirId,
          jadwalMulai,
          status: "DIJADWALKAN",
          assignedBy: session.user?.email ?? null,
        },
      });
      await tx.tiket.update({ where: { id: tiketId }, data: { status: "DIJADWALKAN" } });
      await tx.tiketRiwayat.create({
        data: {
          tiketId,
          status: "DIJADWALKAN",
          catatan: "Armada dijadwalkan (dispatch).",
          operatorId: session.user?.email ?? null,
          operatorNama: session.user?.name ?? null,
        },
      });
      await tx.kendaraan.update({ where: { id: kendaraanId }, data: { status: "BERTUGAS" } });
      await tx.sopir.update({ where: { id: sopirId }, data: { status: "BERTUGAS" } });
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    // Guard double-booking (generated column UNIQUE) → P2002 / "Duplicate entry".
    if (m.includes("uq_") || m.toLowerCase().includes("unique") || m.includes("Duplicate")) {
      return {
        ok: false,
        error: "Kendaraan, sopir, atau tiket sudah punya penugasan aktif (anti double-booking).",
      };
    }
    throw e;
  }

  await notifyStatusChange(
    { id: tiket.id, noTiket: tiket.noTiket, email: tiket.email },
    STATUS_LABEL.DIJADWALKAN,
  );

  revalidatePath("/dashboard/dispatch/penugasan");
  revalidatePath(`/dashboard/permintaan/${tiketId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: `Penugasan dibuat untuk tiket ${tiket.noTiket}.` };
}
