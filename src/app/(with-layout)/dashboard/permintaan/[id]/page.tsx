import { Card, PageHeader } from "@/components/tanki/ui";
import { auth } from "@/lib/auth";
import { canWrite } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { ALLOWED_TRANSITIONS, STATUS_LABEL, statusColor } from "@/lib/tanki/status";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusForm } from "./status-form";

export const dynamic = "force-dynamic";

export default async function TiketDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let tiketId: bigint;
  try {
    tiketId = BigInt(id);
  } catch {
    notFound();
  }

  const tiket = await db.tiket.findUnique({
    where: { id: tiketId! },
    include: {
      riwayat: { orderBy: { createdAt: "asc" } },
      penugasan: {
        orderBy: { createdAt: "desc" },
        include: { kendaraan: true, sopir: true },
      },
    },
  });
  if (!tiket) notFound();

  const session = await auth();
  const writable = canWrite(session);
  const allowed = ALLOWED_TRANSITIONS[tiket.status] ?? [];
  const penugasanAktif = tiket.penugasan.find((p) =>
    ["DIJADWALKAN", "BERANGKAT"].includes(p.status),
  );

  return (
    <>
      <PageHeader
        title={`Tiket ${tiket.noTiket}`}
        description={`Dibuat ${tiket.createdAt.toLocaleString("id-ID")}`}
        action={
          <Link href="/dashboard/permintaan" className="text-sm text-primary hover:underline">
            ← Daftar permintaan
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-body-lg font-bold text-dark dark:text-white">Detail Permintaan</h2>
              <span className={`font-bold ${statusColor(tiket.status)}`}>
                {STATUS_LABEL[tiket.status]}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Info label="No. Pelanggan" value={tiket.noPelanggan} />
              <Info label="Nama" value={tiket.namaSnapshot ?? "-"} />
              <Info label="Alamat" value={tiket.alamatSnapshot ?? "-"} />
              <Info label="No. HP" value={tiket.noHp} />
              <Info label="Email" value={tiket.email ?? "-"} />
              <Info label="Wilayah / Rayon" value={`${tiket.wil ?? "-"} / ${tiket.koderayon ?? "-"}`} />
              <div className="col-span-2">
                <dt className="text-dark-5 dark:text-dark-6">Keluhan</dt>
                <dd className="text-dark dark:text-white">{tiket.keluhan}</dd>
              </div>
            </dl>
          </Card>

          {penugasanAktif && (
            <Card>
              <h2 className="mb-3 text-body-lg font-bold text-dark dark:text-white">Penugasan Aktif</h2>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Info label="Kendaraan" value={`${penugasanAktif.kendaraan.nopol}${penugasanAktif.kendaraan.merk ? " — " + penugasanAktif.kendaraan.merk : ""}`} />
                <Info label="Sopir" value={penugasanAktif.sopir.nama} />
                <Info label="Jadwal" value={penugasanAktif.jadwalMulai.toLocaleString("id-ID")} />
                <Info label="Status penugasan" value={penugasanAktif.status} />
              </dl>
            </Card>
          )}

          <Card>
            <h2 className="mb-4 text-body-lg font-bold text-dark dark:text-white">Riwayat Status</h2>
            <ol className="space-y-3 border-l border-stroke pl-4 dark:border-dark-3">
              {tiket.riwayat.map((r) => (
                <li key={r.id.toString()}>
                  <div className={`text-sm font-semibold ${statusColor(r.status)}`}>
                    {STATUS_LABEL[r.status]}
                  </div>
                  <div className="text-xs text-dark-5 dark:text-dark-6">
                    {r.createdAt.toLocaleString("id-ID")}
                    {r.operatorNama ? ` • ${r.operatorNama}` : ""}
                  </div>
                  {r.catatan && <div className="text-sm text-dark dark:text-dark-6">{r.catatan}</div>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-body-lg font-bold text-dark dark:text-white">Aksi</h2>
            {writable ? (
              <>
                <StatusForm tiketId={tiket.id.toString()} allowed={allowed} />
                {tiket.status === "TERVERIFIKASI" && (
                  <p className="mt-4 text-sm text-dark-5 dark:text-dark-6">
                    Untuk menjadwalkan armada, buka{" "}
                    <Link href="/dashboard/dispatch/penugasan" className="text-primary hover:underline">
                      Dispatch → Penugasan
                    </Link>
                    .
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-dark-5 dark:text-dark-6">
                Akses Anda hanya baca (read-only).
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-dark-5 dark:text-dark-6">{label}</dt>
      <dd className="text-dark dark:text-white">{value}</dd>
    </div>
  );
}
