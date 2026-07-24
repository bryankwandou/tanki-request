import { DataTable } from "@/components/tanki/data-table";
import { Card, PageHeader } from "@/components/tanki/ui";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pencarian Pelanggan" };
export const dynamic = "force-dynamic";

type Search = { q?: string; wil?: string };

export default async function PelangganPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { q, wil } = await searchParams;

  const where: Prisma.PelangganWhereInput = {};
  if (wil) where.wil = wil;
  if (q) {
    where.OR = [
      { nosamb: { contains: q } },
      { nama: { contains: q } },
      { alamat: { contains: q } },
      { koderayon: { contains: q } },
    ];
  }

  // Hanya query bila ada filter — menghindari full scan 231k baris tanpa alasan.
  const hasFilter = Boolean(q || wil);
  const rows = hasFilter
    ? await db.pelanggan.findMany({ where, take: 50, orderBy: { nosamb: "asc" } })
    : [];

  return (
    <>
      <PageHeader
        title="Pencarian Pelanggan"
        description="Master data pelanggan PDAM (read-only, ~231.000 baris). Cari untuk verifikasi & bantu input (FR-49)."
      />

      <Card className="mb-6">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-dark-5 dark:text-dark-6">Cari</span>
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="No. Pelanggan / Nama / Alamat"
              className="w-72 rounded-lg border border-stroke bg-transparent px-3 py-2 outline-none focus:border-primary dark:border-dark-3"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-dark-5 dark:text-dark-6">Wilayah</span>
            <select
              name="wil"
              defaultValue={wil ?? ""}
              className="rounded-lg border border-stroke bg-transparent px-3 py-2 outline-none focus:border-primary dark:border-dark-3"
            >
              <option value="">Semua</option>
              {["01", "02", "03", "04", "05", "06"].map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-primary px-5 py-2 font-medium text-white hover:bg-opacity-90"
          >
            Cari
          </button>
        </form>
      </Card>

      {!hasFilter ? (
        <Card className="p-8 text-center text-dark-5 dark:text-dark-6">
          Masukkan kata kunci untuk mencari pelanggan.
        </Card>
      ) : (
        <>
          <DataTable
            rows={rows}
            keyOf={(p) => p.nosamb}
            empty="Tidak ada pelanggan yang cocok."
            columns={[
              { header: "No. Pelanggan", primary: true, cell: (p) => p.nosamb },
              { header: "Nama", cell: (p) => p.nama },
              { header: "Alamat", cell: (p) => p.alamat ?? "-" },
              { header: "Rayon", cell: (p) => p.koderayon ?? "-" },
              { header: "Wil", cell: (p) => p.wil ?? "-" },
            ]}
          />
          {rows.length === 50 && (
            <p className="mt-3 text-xs text-dark-5 dark:text-dark-6">
              Menampilkan maks. 50 hasil — persempit pencarian bila perlu.
            </p>
          )}
        </>
      )}
    </>
  );
}
