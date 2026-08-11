"use client";

import {
  mintaKodeMasukAction,
  verifikasiMasukAction,
  type MasukState,
} from "@/app/(public)/actions";
import { useState, useTransition } from "react";

const inputClass =
  "w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-[#0a2540] outline-none transition focus:border-[#0284c7] focus:ring-2 focus:ring-[#0284c7]/20";
const labelClass = "mb-1.5 block text-sm font-semibold text-[#0a2540]";

/**
 * Masuk dengan kode email (butir 3.6).
 *
 * Tidak ada kata sandi. Buktinya sama dengan yang sudah dipakai alur pengajuan:
 * menguasai email yang pernah dipakai pada permintaan pelanggan tersebut.
 */
export function MasukForm() {
  const [state, setState] = useState<MasukState>({ status: "idle" });
  const [pending, start] = useTransition();

  function minta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => setState(await mintaKodeMasukAction(fd)));
  }

  function verifikasi(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("otpId", state.otpId ?? "");
    start(async () => setState(await verifikasiMasukAction(fd)));
  }

  if (state.status === "otp") {
    return (
      <form onSubmit={verifikasi} className="space-y-4">
        <div className="rounded-xl bg-[#e0f2fe] px-4 py-3 text-sm text-[#0369a1]">
          Bila data Anda cocok dengan permintaan yang pernah diajukan, kami
          mengirim kode verifikasi ke <strong>{state.emailMasked}</strong>.
        </div>
        {state.error && (
          <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
            {state.error}
          </div>
        )}
        <div>
          <label className={labelClass}>Kode verifikasi</label>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            required
            placeholder="••••••"
            className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-[#0284c7] p-4 font-semibold text-white shadow-lg shadow-[#0284c7]/25 transition hover:bg-[#0369a1] disabled:opacity-60"
        >
          {pending ? "Memeriksa…" : "Masuk"}
        </button>
        <button
          type="button"
          onClick={() => setState({ status: "idle" })}
          className="w-full text-sm text-[#0a2540]/60 hover:underline"
        >
          ← Ubah data
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={minta} className="space-y-4">
      {state.error && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {state.error}
        </div>
      )}
      <div>
        <label className={labelClass}>No. Pelanggan</label>
        <input
          name="noPelanggan"
          inputMode="numeric"
          maxLength={9}
          required
          placeholder="9 digit"
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Email</label>
        <input
          name="email"
          type="email"
          required
          placeholder="Email yang Anda pakai saat mengajukan"
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-[#0284c7] p-4 font-semibold text-white shadow-lg shadow-[#0284c7]/25 transition hover:bg-[#0369a1] disabled:opacity-60"
      >
        {pending ? "Mengirim kode…" : "Kirim kode ke email"}
      </button>
      <p className="text-center text-xs text-[#0a2540]/55">
        Masuk bersifat opsional — Anda tetap bisa mengajukan dan melacak
        permintaan tanpa masuk.
      </p>
    </form>
  );
}
