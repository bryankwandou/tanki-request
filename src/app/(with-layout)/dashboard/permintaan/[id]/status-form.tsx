"use client";

import { updateStatus, type ActionState } from "../actions";
import { REASON_REQUIRED, STATUS_LABEL } from "@/lib/tanki/status";
import type { StatusTiket } from "@/generated/prisma/client";
import { useActionState, useState } from "react";

const initial: ActionState = { ok: false };

export function StatusForm({
  tiketId,
  allowed,
}: {
  tiketId: string;
  allowed: StatusTiket[];
}) {
  const [state, formAction, pending] = useActionState(updateStatus, initial);
  const [selected, setSelected] = useState<StatusTiket | "">("");

  if (allowed.length === 0) {
    return (
      <p className="text-sm text-dark-5 dark:text-dark-6">
        Tidak ada aksi status manual untuk tiket ini.
      </p>
    );
  }

  const reasonNeeded = selected && REASON_REQUIRED.includes(selected as StatusTiket);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="tiketId" value={tiketId} />
      {state.error && (
        <div className="rounded-lg bg-red-light-6 px-3 py-2 text-sm text-red-dark">
          {state.error}
        </div>
      )}
      {state.ok && state.message && (
        <div className="rounded-lg bg-green-light-7 px-3 py-2 text-sm text-green-dark">
          {state.message}
        </div>
      )}

      <select
        name="newStatus"
        required
        value={selected}
        onChange={(e) => setSelected(e.target.value as StatusTiket)}
        className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 outline-none focus:border-primary dark:border-dark-3"
      >
        <option value="">— pilih status —</option>
        {allowed.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>

      <textarea
        name="catatan"
        rows={2}
        placeholder={reasonNeeded ? "Alasan (wajib)" : "Catatan (opsional)"}
        className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 outline-none focus:border-primary dark:border-dark-3"
      />

      <button
        type="submit"
        disabled={pending || !selected}
        className="rounded-lg bg-primary px-5 py-2 font-medium text-white hover:bg-opacity-90 disabled:opacity-60"
      >
        {pending ? "Menyimpan..." : "Update Status"}
      </button>
    </form>
  );
}
