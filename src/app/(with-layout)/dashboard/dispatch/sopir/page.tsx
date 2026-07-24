import { DataTable } from "@/components/tanki/data-table";
import { Card, PageHeader } from "@/components/tanki/ui";
import { auth } from "@/lib/auth";
import { canWrite } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import type { Metadata } from "next";
import { SopirForm } from "./sopir-form";

export const metadata: Metadata = { title: "Sopir" };
export const dynamic = "force-dynamic";

export default async function SopirPage() {
  const [rows, session] = await Promise.all([
    db.sopir.findMany({ orderBy: { nama: "asc" } }),
    auth(),
  ]);
  const writable = canWrite(session);

  return (
    <>
      <PageHeader title="Master Sopir" description="Kelola data sopir/operator lapangan (FR-40)." />
      {writable && (
        <Card className="mb-6">
          <SopirForm />
        </Card>
      )}
      <DataTable
        rows={rows}
        keyOf={(s) => s.id.toString()}
        empty="Belum ada sopir."
        columns={[
          { header: "Nama", primary: true, cell: (s) => s.nama },
          { header: "No. HP", cell: (s) => s.noHp ?? "-" },
          { header: "Status", cell: (s) => s.status },
        ]}
      />
    </>
  );
}
