"use client";

import { createKendaraan, type ActionState } from "../actions";
import { useActionState } from "react";

const initial: ActionState = { ok: false };
const cls =
  "rounded-lg border border-stroke bg-transparent px-3 py-2 outline-none focus:border-primary dark:border-dark-3";

export function KendaraanForm() {
  const [state, action, pending] = useActionState(createKendaraan, initial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-dark-5 dark:text-dark-6">No. Polisi *</span>
        <input name="nopol" required placeholder="DD 1234 XX" className={cls} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-dark-5 dark:text-dark-6">Merk</span>
        <input name="merk" placeholder="Hino / Mitsubishi" className={cls} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-dark-5 dark:text-dark-6">Kapasitas (L)</span>
        <input name="kapasitasLiter" inputMode="numeric" placeholder="5000" className={cls} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-5 py-2 font-medium text-white hover:bg-opacity-90 disabled:opacity-60"
      >
        {pending ? "..." : "Tambah"}
      </button>
      {state.error && <span className="text-sm text-red-dark">{state.error}</span>}
      {state.ok && <span className="text-sm text-green-dark">{state.message}</span>}
    </form>
  );
}
