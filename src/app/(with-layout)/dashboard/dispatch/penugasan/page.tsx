import { DataTable } from "@/components/tanki/data-table";
import { Card, PageHeader } from "@/components/tanki/ui";
import { auth } from "@/lib/auth";
import { canWrite } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import type { Metadata } from "next";
import Link from "next/link";
import { LokasiForm } from "./lokasi-form";
import { PenugasanForm } from "./penugasan-form";

export const metadata: Metadata = { title: "Penugasan" };
export const dynamic = "force-dynamic";

export default async function PenugasanPage() {
  const [tikets, kendaraans, sopirs, list, session] = await Promise.all([
    db.tiket.findMany({
      where: { status: { in: ["DITERIMA", "TERVERIFIKASI"] } },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    db.kendaraan.findMany({ where: { status: "TERSEDIA", aktif: true }, orderBy: { nopol: "asc" } }),
    db.sopir.findMany({ where: { status: "TERSEDIA", aktif: true }, orderBy: { nama: "asc" } }),
    db.penugasan.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { tiket: true, kendaraan: true, sopir: true },
    }),
    auth(),
  ]);
  const writable = canWrite(session);

  return (
    <>
      <PageHeader
        title="Penugasan / Dispatch"
        description="Assign kendaraan + sopir + jadwal ke tiket (FR-41). Membuat penugasan otomatis mengubah tiket → DIJADWALKAN, mencatat riwayat, dan mengirim notifikasi."
      />

      {writable && (
        <Card className="mb-6">
          <PenugasanForm
            tikets={tikets.map((t) => ({
              value: t.id.toString(),
              label: `${t.noTiket} — ${t.namaSnapshot ?? t.noPelanggan} (${t.status})`,
            }))}
            kendaraans={kendaraans.map((k) => ({
              value: k.id.toString(),
              label: `${k.nopol}${k.merk ? " — " + k.merk : ""}`,
            }))}
            sopirs={sopirs.map((s) => ({ value: s.id.toString(), label: s.nama }))}
          />
        </Card>
      )}

      <DataTable
        rows={list}
        keyOf={(p) => p.id.toString()}
        empty="Belum ada penugasan."
        columns={[
          {
            header: "Tiket",
            primary: true,
            cell: (p) => (
              <Link href={`/dashboard/permintaan/${p.tiketId}`} className="text-primary hover:underline">
                {p.tiket.noTiket}
              </Link>
            ),
          },
          { header: "Kendaraan", cell: (p) => p.kendaraan.nopol },
          { header: "Sopir", cell: (p) => p.sopir.nama },
          { header: "Jadwal", cell: (p) => p.jadwalMulai.toLocaleString("id-ID") },
          { header: "Status", cell: (p) => p.status },
          {
            // Butir 3.5 — posisi hanya bisa diperbarui selama penugasan masih
            // berjalan; yang sudah ditutup ditampilkan apa adanya.
            header: "Posisi armada",
            cell: (p) =>
              !writable || p.status === "SELESAI" || p.status === "DIBATALKAN" ? (
                <span className="text-sm text-dark-5 dark:text-dark-6">
                  {p.lokasiTeks ?? "—"}
                </span>
              ) : (
                <LokasiForm
                  penugasanId={p.id.toString()}
                  lokasiTeks={p.lokasiTeks}
                  lokasiLat={p.lokasiLat === null ? null : String(p.lokasiLat)}
                  lokasiLng={p.lokasiLng === null ? null : String(p.lokasiLng)}
                />
              ),
          },
        ]}
      />
    </>
  );
}
