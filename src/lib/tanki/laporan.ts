/**
 * Agregasi Laporan (Issue #1, FR-45..47).
 *
 * Semua pengelompokan wilayah/rayon memakai kolom snapshot di `tiket`, bukan
 * join hidup ke `pelanggan`. Master bisa berubah — pelanggan pindah rayon —
 * dan laporan periode lalu tidak boleh ikut berubah karenanya.
 */
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  STATUS_TIKET,
  type LaporanFilter,
  type StatusTiketName,
} from "@/lib/tanki/laporan-filter";

export type Bucket = { key: string; total: number };

export type LaporanHasil = {
  total: number;
  perStatus: { status: StatusTiketName; total: number }[];
  perWilayah: Bucket[];
  perRayon: Bucket[];
};

export function buildWhere(f: LaporanFilter): Prisma.TiketWhereInput {
  const where: Prisma.TiketWhereInput = {
    createdAt: { gte: f.start, lt: f.endExclusive },
  };
  if (f.status) where.status = f.status;
  if (f.wil) where.wil = f.wil;
  if (f.rayon) where.koderayon = f.rayon;
  return where;
}

export async function getLaporan(f: LaporanFilter): Promise<LaporanHasil> {
  const where = buildWhere(f);

  const [total, byStatus, byWil, byRayon] = await Promise.all([
    db.tiket.count({ where }),
    db.tiket.groupBy({ by: ["status"], where, _count: { _all: true } }),
    db.tiket.groupBy({ by: ["wil"], where, _count: { _all: true } }),
    db.tiket.groupBy({ by: ["koderayon"], where, _count: { _all: true } }),
  ]);

  const countStatus = Object.fromEntries(
    byStatus.map((g) => [g.status, g._count._all]),
  ) as Record<string, number>;

  const bucket = (rows: { _count: { _all: number } }[], keyOf: (r: never) => string | null) =>
    rows
      .map((r) => ({ key: keyOf(r as never) ?? "(tanpa data)", total: r._count._all }))
      .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));

  return {
    total,
    // Semua status selalu muncul, termasuk yang nol — tabel yang barisnya
    // berubah-ubah tiap filter menyulitkan pembacaan antar periode.
    perStatus: STATUS_TIKET.map((s) => ({ status: s, total: countStatus[s] ?? 0 })),
    perWilayah: bucket(byWil, (r: { wil: string | null }) => r.wil),
    perRayon: bucket(byRayon, (r: { koderayon: string | null }) => r.koderayon),
  };
}

export type BarisEkspor = {
  noTiket: string;
  tanggal: string;
  status: string;
  noPelanggan: string;
  nama: string;
  alamat: string;
  wil: string;
  rayon: string;
  noHp: string;
};

/**
 * Baris detail untuk ekspor. Sengaja memakai `where` yang sama persis dengan
 * agregat di layar, supaya jumlah baris berkas selalu sama dengan angka Total —
 * itu syarat penerimaan Issue #1 dan gampang melenceng kalau filternya disusun
 * dua kali di dua tempat.
 */
export async function getBarisEkspor(f: LaporanFilter): Promise<BarisEkspor[]> {
  const rows = await db.tiket.findMany({
    where: buildWhere(f),
    orderBy: { createdAt: "asc" },
    select: {
      noTiket: true,
      createdAt: true,
      status: true,
      noPelanggan: true,
      namaSnapshot: true,
      alamatSnapshot: true,
      wil: true,
      koderayon: true,
      noHp: true,
    },
  });

  return rows.map((r) => ({
    noTiket: r.noTiket,
    tanggal: r.createdAt.toISOString(),
    status: r.status,
    noPelanggan: r.noPelanggan,
    nama: r.namaSnapshot ?? "",
    alamat: r.alamatSnapshot ?? "",
    wil: r.wil ?? "",
    rayon: r.koderayon ?? "",
    noHp: r.noHp,
  }));
}

export const KOLOM_EKSPOR: { key: keyof BarisEkspor; label: string }[] = [
  { key: "noTiket", label: "No. Tiket" },
  { key: "tanggal", label: "Tanggal Dibuat" },
  { key: "status", label: "Status" },
  { key: "noPelanggan", label: "No. Pelanggan" },
  { key: "nama", label: "Nama" },
  { key: "alamat", label: "Alamat" },
  { key: "wil", label: "Wilayah" },
  { key: "rayon", label: "Rayon" },
  { key: "noHp", label: "No. HP" },
];
