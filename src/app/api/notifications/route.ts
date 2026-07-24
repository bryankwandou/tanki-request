import { auth } from "@/lib/auth";
import { canAccessApp } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// Notifikasi operator: permintaan baru (status DITERIMA), terbaru dulu.
export async function GET() {
  const session = await auth();
  if (!canAccessApp(session)) {
    return NextResponse.json({ count: 0, items: [] }, { status: 401 });
  }

  const [items, count] = await Promise.all([
    db.tiket.findMany({
      where: { status: "DITERIMA" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        noTiket: true,
        namaSnapshot: true,
        noPelanggan: true,
        createdAt: true,
      },
    }),
    db.tiket.count({ where: { status: "DITERIMA" } }),
  ]);

  return NextResponse.json({
    count,
    items: items.map((t) => ({
      id: t.id.toString(),
      noTiket: t.noTiket,
      nama: t.namaSnapshot ?? t.noPelanggan,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}
