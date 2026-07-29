import { Card, PageHeader, StatCard } from "@/components/tanki/ui";
import { getLaporan } from "@/lib/tanki/laporan";
import {
  MAX_RANGE_DAYS,
  STATUS_LABEL,
  STATUS_TIKET,
  parseLaporanFilter,
  type RawFilter,
} from "@/lib/tanki/laporan-filter";
import type { Metadata } from "next";
import { LaporanStatusChart } from "./chart";

export const metadata: Metadata = { title: "Laporan" };
export const dynamic = "force-dynamic";

const inputClass =
  "rounded-lg border border-stroke bg-transparent px-3 py-2 text-dark outline-none focus:border-primary dark:border-dark-3 dark:text-white";

function Tabel({
  judul,
  kolom,
  baris,
  kosong,
}: {
  judul: string;
  kolom: string;
  baris: { key: string; total: number }[];
  kosong: string;
}) {
  const total = baris.reduce((s, b) => s + b.total, 0);
  return (
    <Card>
      <h3 className="mb-4 text-heading-6 font-bold text-dark dark:text-white">{judul}</h3>
      {baris.length === 0 ? (
        <p className="text-dark-5 dark:text-dark-6">{kosong}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stroke dark:border-dark-3">
                <th className="py-2 font-medium text-dark-5 dark:text-dark-6">{kolom}</th>
                <th className="py-2 text-right font-medium text-dark-5 dark:text-dark-6">Jumlah</th>
                <th className="py-2 text-right font-medium text-dark-5 dark:text-dark-6">%</th>
              </tr>
            </thead>
            <tbody>
              {baris.map((b) => (
                <tr key={b.key} className="border-b border-stroke last:border-0 dark:border-dark-3">
                  <td className="py-2 text-dark dark:text-white">{b.key}</td>
                  <td className="py-2 text-right text-dark dark:text-white">{b.total}</td>
                  <td className="py-2 text-right text-dark-5 dark:text-dark-6">
                    {total === 0 ? "0%" : `${((b.total / total) * 100).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default async function LaporanPage({
  searchParams,
}: {
  searchParams: Promise<RawFilter>;
}) {
  const raw = await searchParams;
  const filter = parseLaporanFilter(raw, new Date());
  const hasil = await getLaporan(filter);

  // Tautan ekspor memakai filter yang SUDAH dibersihkan, bukan query string
  // mentah, supaya isi berkas yang diunduh persis sama dengan yang di layar.
  const qs = new URLSearchParams({ from: filter.fromLabel, to: filter.toLabel });
  if (filter.status) qs.set("status", filter.status);
  if (filter.wil) qs.set("wil", filter.wil);
  if (filter.rayon) qs.set("rayon", filter.rayon);

  return (
    <>
      <PageHeader
        title="Laporan"
        description="Rekap permintaan per status, periode, wilayah, dan rayon (FR-45..47). Dimensi terbatas pada wilayah + rayon (master tidak memuat cabang/golongan/tarif)."
      />

      <Card className="mb-6">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-dark-5 dark:text-dark-6">Dari</span>
            <input type="date" name="from" defaultValue={filter.fromLabel} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-dark-5 dark:text-dark-6">Sampai</span>
            <input type="date" name="to" defaultValue={filter.toLabel} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-dark-5 dark:text-dark-6">Status</span>
            <select name="status" defaultValue={filter.status ?? ""} className={inputClass}>
              <option value="">Semua status</option>
              {STATUS_TIKET.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-dark-5 dark:text-dark-6">Wilayah</span>
            <input
              name="wil"
              inputMode="numeric"
              placeholder="mis. 04"
              defaultValue={filter.wil ?? ""}
              className={`${inputClass} w-28`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-dark-5 dark:text-dark-6">Rayon</span>
            <input
              name="rayon"
              inputMode="numeric"
              placeholder="mis. 040402"
              defaultValue={filter.rayon ?? ""}
              className={`${inputClass} w-36`}
            />
          </label>

          <button
            type="submit"
            className="rounded-lg bg-primary px-5 py-2 font-medium text-white hover:bg-opacity-90"
          >
            Terapkan
          </button>
          <a
            href="/dashboard/laporan"
            className="rounded-lg border border-stroke px-5 py-2 font-medium text-dark dark:border-dark-3 dark:text-white"
          >
            Reset
          </a>

          <span className="ml-auto flex gap-2">
            <a
              href={`/dashboard/laporan/export?format=csv&${qs}`}
              className="rounded-lg border border-stroke px-4 py-2 font-medium text-dark dark:border-dark-3 dark:text-white"
            >
              Export CSV
            </a>
            <a
              href={`/dashboard/laporan/export?format=xlsx&${qs}`}
              className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-opacity-90"
            >
              Export Excel
            </a>
          </span>
        </form>

        <p className="mt-3 text-sm text-dark-5 dark:text-dark-6">
          Periode <strong>{filter.fromLabel}</strong> s.d. <strong>{filter.toLabel}</strong>{" "}
          (inklusif, waktu WITA). Rentang maksimum {MAX_RANGE_DAYS} hari — permintaan yang lebih
          lebar dipotong dari sisi tanggal awal.
        </p>
      </Card>

      <dl className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Permintaan" value={hasil.total} />
        {hasil.perStatus
          .filter((s) => ["SELESAI", "DITOLAK", "DIBATALKAN"].includes(s.status))
          .map((s) => (
            <StatCard key={s.status} label={STATUS_LABEL[s.status]} value={s.total} />
          ))}
      </dl>

      <Card className="mb-6">
        <h3 className="mb-4 text-heading-6 font-bold text-dark dark:text-white">
          Permintaan per Status
        </h3>
        <LaporanStatusChart
          data={hasil.perStatus.map((s) => ({ label: STATUS_LABEL[s.status], total: s.total }))}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Tabel
          judul="Rekap per Status"
          kolom="Status"
          baris={hasil.perStatus.map((s) => ({ key: STATUS_LABEL[s.status], total: s.total }))}
          kosong="Tidak ada permintaan pada periode ini."
        />
        <Tabel
          judul="Rekap per Wilayah"
          kolom="Wilayah"
          baris={hasil.perWilayah}
          kosong="Tidak ada permintaan pada periode ini."
        />
        <Tabel
          judul="Rekap per Rayon"
          kolom="Kode Rayon"
          baris={hasil.perRayon}
          kosong="Tidak ada permintaan pada periode ini."
        />
      </div>
    </>
  );
}
