"use client";

import { Combobox } from "@/components/tanki/combobox";
import { createPenugasan, type ActionState } from "../actions";
import { useActionState } from "react";

const initial: ActionState = { ok: false };
const cls =
  "w-full rounded-lg border border-stroke bg-transparent px-3 py-2 outline-none focus:border-primary dark:border-dark-3";

type Opt = { value: string; label: string };

export function PenugasanForm({
  tikets,
  kendaraans,
  sopirs,
}: {
  tikets: Opt[];
  kendaraans: Opt[];
  sopirs: Opt[];
}) {
  const [state, action, pending] = useActionState(createPenugasan, initial);

  const disabled = tikets.length === 0 || kendaraans.length === 0 || sopirs.length === 0;

  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      {state.error && (
        <div className="md:col-span-2 rounded-lg bg-red-light-6 px-3 py-2 text-sm text-red-dark">
          {state.error}
        </div>
      )}
      {state.ok && (
        <div className="md:col-span-2 rounded-lg bg-green-light-7 px-3 py-2 text-sm text-green-dark">
          {state.message}
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm md:col-span-2">
        <span className="text-dark-5 dark:text-dark-6">Tiket (siap dijadwalkan)</span>
        <select name="tiketId" required className={cls}>
          <option value="">— pilih tiket —</option>
          {tikets.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1 text-sm">
        <span className="text-dark-5 dark:text-dark-6">Kendaraan (tersedia)</span>
        <Combobox
          name="kendaraanId"
          options={kendaraans}
          placeholder="Ketik No. Polisi / merk…"
          emptyText="Tidak ada kendaraan tersedia"
        />
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <span className="text-dark-5 dark:text-dark-6">Sopir (tersedia)</span>
        <Combobox
          name="sopirId"
          options={sopirs}
          placeholder="Ketik nama sopir…"
          emptyText="Tidak ada sopir tersedia"
        />
      </div>

      <label className="flex flex-col gap-1 text-sm md:col-span-2">
        <span className="text-dark-5 dark:text-dark-6">Jadwal berangkat</span>
        <input type="datetime-local" name="jadwalMulai" required className={cls} />
      </label>

      <div className="md:col-span-2">
        <button
          type="submit"
          disabled={pending || disabled}
          className="rounded-lg bg-primary px-5 py-2 font-medium text-white hover:bg-opacity-90 disabled:opacity-60"
        >
          {pending ? "Menyimpan..." : "Buat Penugasan"}
        </button>
        {disabled && (
          <span className="ml-3 text-sm text-dark-5 dark:text-dark-6">
            Butuh minimal 1 tiket siap, 1 kendaraan, dan 1 sopir tersedia.
          </span>
        )}
      </div>
    </form>
  );
}
