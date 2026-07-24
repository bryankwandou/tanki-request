import { DataTable } from "@/components/tanki/data-table";
import { Card, PageHeader } from "@/components/tanki/ui";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Permintaan" };
export const dynamic = "force-dynamic";

const STATUSES = [
  "DITERIMA",
  "TERVERIFIKASI",
  "DIJADWALKAN",
  "DALAM_PERJALANAN",
  "SELESAI",
  "DITOLAK",
  "DIBATALKAN",
] as const;

type Search = { status?: string; q?: string };

export default async function PermintaanPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { status, q } = await searchParams;

  const where: Prisma.TiketWhereInput = {};
  if (status && (STATUSES as readonly string[]).includes(status)) {
    where.status = status as (typeof STATUSES)[number];
  }
  if (q) {
    where.OR = [
      { noTiket: { contains: q } },
      { noPelanggan: { contains: q } },
      { noHp: { contains: q } },
    ];
  }

  const tiket = await db.tiket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <>
      <PageHeader
        title="Permintaan / Pencarian"
        description="Cari tiket berdasarkan No. Tiket, No. Pelanggan, No. HP, atau status (FR-48)."
      />

      <Card className="mb-6">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-dark-5 dark:text-dark-6">Cari</span>
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="No. Tiket / Pelanggan / HP"
              className="rounded-lg border border-stroke bg-transparent px-3 py-2 outline-none focus:border-primary dark:border-dark-3"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-dark-5 dark:text-dark-6">Status</span>
            <select
              name="status"
              defaultValue={status ?? ""}
              className="rounded-lg border border-stroke bg-transparent px-3 py-2 outline-none focus:border-primary dark:border-dark-3"
            >
              <option value="">Semua</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-primary px-5 py-2 font-medium text-white hover:bg-opacity-90"
          >
            Filter
          </button>
        </form>
      </Card>

      <DataTable
        rows={tiket}
        keyOf={(t) => t.id.toString()}
        empty="Belum ada permintaan."
        columns={[
          {
            header: "No. Tiket",
            primary: true,
            cell: (t) => (
              <Link href={`/dashboard/permintaan/${t.id}`} className="text-primary hover:underline">
                {t.noTiket}
              </Link>
            ),
          },
          { header: "No. Pelanggan", cell: (t) => t.noPelanggan },
          { header: "Nama", cell: (t) => t.namaSnapshot ?? "-" },
          { header: "No. HP", cell: (t) => t.noHp },
          { header: "Status", cell: (t) => t.status },
          { header: "Dibuat", cell: (t) => t.createdAt.toLocaleString("id-ID") },
        ]}
      />
    </>
  );
}
