import { DataTable } from "@/components/tanki/data-table";
import { Card, PageHeader } from "@/components/tanki/ui";
import { auth } from "@/lib/auth";
import { canWrite } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import type { Metadata } from "next";
import { KendaraanForm } from "./kendaraan-form";

export const metadata: Metadata = { title: "Kendaraan" };
export const dynamic = "force-dynamic";

export default async function KendaraanPage() {
  const [rows, session] = await Promise.all([
    db.kendaraan.findMany({ orderBy: { nopol: "asc" } }),
    auth(),
  ]);
  const writable = canWrite(session);

  return (
    <>
      <PageHeader
        title="Master Kendaraan (Mobil Tangki)"
        description="Kelola armada mobil tangki (FR-39)."
      />
      {writable && (
        <Card className="mb-6">
          <KendaraanForm />
        </Card>
      )}
      <DataTable
        rows={rows}
        keyOf={(k) => k.id.toString()}
        empty="Belum ada kendaraan."
        columns={[
          { header: "No. Polisi", primary: true, cell: (k) => k.nopol },
          { header: "Merk", cell: (k) => k.merk ?? "-" },
          { header: "Kapasitas (L)", cell: (k) => k.kapasitasLiter ?? "-" },
          { header: "Status", cell: (k) => k.status },
        ]}
      />
    </>
  );
}
