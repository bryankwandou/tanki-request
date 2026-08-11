"use client";

import { updateLokasiArmada, type ActionState } from "../actions";
import { useActionState } from "react";

const initial: ActionState = { ok: false };
const cls =
  "w-full rounded-lg border border-stroke bg-transparent px-2 py-1.5 text-sm outline-none focus:border-primary dark:border-dark-3";

/**
 * Pembaruan posisi armada oleh petugas (butir 3.5 laporan review).
 *
 * Peta real-time yang diminta laporan butuh GPS tracker di setiap mobil, yang
 * belum dimiliki PDAM. Form kecil ini separuh yang bisa jalan hari ini:
 * petugas mengetik posisi, warga melihatnya di halaman lacak.
 *
 * Koordinat bersifat OPSIONAL — keterangan teks saja ("Jl. Perintis, dekat
 * SPBU") sudah menjawab pertanyaan warga "airnya sampai mana", dan jauh lebih
 * mungkin benar-benar diisi petugas di lapangan daripada angka desimal.
 */
export function LokasiForm({
  penugasanId,
  lokasiTeks,
  lokasiLat,
  lokasiLng,
}: {
  penugasanId: string;
  lokasiTeks: string | null;
  lokasiLat: string | null;
  lokasiLng: string | null;
}) {
  const [s, kirim, mengirim] = useActionState(updateLokasiArmada, initial);

  return (
    <form action={kirim} className="space-y-1.5">
      <input type="hidden" name="penugasanId" value={penugasanId} />
      <input
        name="lokasiTeks"
        defaultValue={lokasiTeks ?? ""}
        placeholder="Posisi, mis. Jl. Perintis dekat SPBU"
        maxLength={200}
        className={cls}
      />
      <div className="flex gap-1.5">
        <input
          name="lokasiLat"
          defaultValue={lokasiLat ?? ""}
          placeholder="Lat (opsional)"
          inputMode="decimal"
          className={cls}
        />
        <input
          name="lokasiLng"
          defaultValue={lokasiLng ?? ""}
          placeholder="Lng (opsional)"
          inputMode="decimal"
          className={cls}
        />
      </div>
      <button
        type="submit"
        disabled={mengirim}
        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {mengirim ? "Menyimpan…" : "Perbarui posisi"}
      </button>
      {s.error && <p className="text-sm text-red">{s.error}</p>}
      {s.ok && s.message && <p className="text-sm text-green">{s.message}</p>}
    </form>
  );
}
