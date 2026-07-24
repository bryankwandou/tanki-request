import { Card, PageHeader, StubNotice } from "@/components/tanki/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Laporan" };

export default function LaporanPage() {
  return (
    <>
      <PageHeader
        title="Laporan"
        description="Rekap permintaan per status, periode, wilayah, dan rayon (FR-45..47). Dimensi terbatas pada wilayah + rayon (master tidak memuat cabang/golongan/tarif)."
      />

      <Card className="mb-6">
        <form className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-dark-5 dark:text-dark-6">Dari</span>
            <input type="date" disabled className="rounded-lg border border-stroke bg-transparent px-3 py-2 opacity-60 dark:border-dark-3" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-dark-5 dark:text-dark-6">Sampai</span>
            <input type="date" disabled className="rounded-lg border border-stroke bg-transparent px-3 py-2 opacity-60 dark:border-dark-3" />
          </label>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-lg bg-primary px-5 py-2 font-medium text-white opacity-60"
          >
            Export Excel (segera)
          </button>
        </form>
      </Card>

      <Card>
        <StubNotice>
          Skeleton modul — panel filter opt-in, agregasi, dan ekspor Excel/CSV
          belum diimplementasikan pada scaffold ini.
        </StubNotice>
      </Card>
    </>
  );
}
