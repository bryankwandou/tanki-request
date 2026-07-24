import { Card, PageHeader, StatCard } from "@/components/tanki/ui";
import { db } from "@/lib/db";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DITERIMA: "Diterima",
  TERVERIFIKASI: "Terverifikasi",
  DIJADWALKAN: "Dijadwalkan",
  DALAM_PERJALANAN: "Dalam Perjalanan",
  SELESAI: "Selesai",
  DITOLAK: "Ditolak",
  DIBATALKAN: "Dibatalkan",
};

const ACTIVE_STATUSES = [
  "DITERIMA",
  "TERVERIFIKASI",
  "DIJADWALKAN",
  "DALAM_PERJALANAN",
];

export default async function DashboardPage() {
  // Aggregate jumlah tiket per status (FR-36). Kosong = nol pada scaffold.
  const [grouped, totalTiket, armadaTersedia, armadaBertugas] =
    await Promise.all([
      db.tiket.groupBy({ by: ["status"], _count: { _all: true } }),
      db.tiket.count(),
      db.kendaraan.count({ where: { status: "TERSEDIA" } }),
      db.kendaraan.count({ where: { status: "BERTUGAS" } }),
    ]);

  const countByStatus = Object.fromEntries(
    grouped.map((g) => [g.status, g._count._all]),
  ) as Record<string, number>;

  const antrianAktif = ACTIVE_STATUSES.reduce(
    (sum, s) => sum + (countByStatus[s] ?? 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Ringkasan permintaan layanan mobil tangki & status armada."
      />

      <dl className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        <StatCard label="Total Permintaan" value={totalTiket} href="/dashboard/permintaan" />
        <StatCard
          label="Antrian Aktif"
          value={antrianAktif}
          href="/dashboard/permintaan"
          accent="text-blue"
        />
        {Object.keys(STATUS_LABEL).map((s) => (
          <StatCard
            key={s}
            label={STATUS_LABEL[s]}
            value={countByStatus[s] ?? 0}
            href={`/dashboard/permintaan?status=${s}`}
          />
        ))}
      </dl>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-body-lg font-bold text-dark dark:text-white">
            Status Armada
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-dark-5 dark:text-dark-6">Tersedia</p>
              <p className="text-heading-5 font-bold text-green">
                {armadaTersedia}
              </p>
            </div>
            <div>
              <p className="text-sm text-dark-5 dark:text-dark-6">Bertugas</p>
              <p className="text-heading-5 font-bold text-orange-light">
                {armadaBertugas}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 text-body-lg font-bold text-dark dark:text-white">
            Selamat datang 👋
          </h2>
          <p className="text-sm text-dark-5 dark:text-dark-6">
            Ini adalah scaffold Tanki Je&apos;ne&apos;. Modul Permintaan &amp;
            Pencarian Pelanggan sudah terhubung ke database; modul Dispatch,
            Laporan, dan Konfigurasi masih berupa kerangka untuk diisi pada
            tahap berikutnya.
          </p>
        </Card>
      </div>
    </>
  );
}
