"use client";

import { resendOtp, submitPermintaan, verifyOtp } from "@/app/(public)/actions";
import { SalinTeks } from "@/components/tanki/salin-teks";
import {
  KUNCI_RIWAYAT,
  bacaRiwayat,
  tambahEntri,
  tautanLacak,
} from "@/lib/tanki/riwayat-lokal";
import { useState, useTransition } from "react";

/**
 * Simpan tiket ke riwayat perangkat (butir 3.3 laporan review).
 *
 * Dibungkus try/catch: localStorage bisa dilarang kebijakan peramban atau penuh
 * (QuotaExceededError). Permintaan pengguna SUDAH tersimpan di server pada
 * titik ini, jadi kegagalan menyimpan salinan kenyamanan tidak boleh
 * menampilkan error apa pun — apalagi menutupi nomor tiket yang baru terbit.
 */
function simpanRiwayatLokal(noTiket: string, noPelanggan: string) {
  try {
    const sekarang = bacaRiwayat(window.localStorage.getItem(KUNCI_RIWAYAT));
    const baru = tambahEntri(sekarang, {
      noTiket,
      noPelanggan,
      disimpanPada: Date.now(),
    });
    window.localStorage.setItem(KUNCI_RIWAYAT, JSON.stringify(baru));
  } catch {
    /* diabaikan — nomor tiket tetap tampil di layar dan dikirim lewat email */
  }
}

const inputClass =
  "w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 py-3 text-[#0a2540] outline-none transition focus:border-[#0284c7] focus:bg-white focus:ring-2 focus:ring-[#0284c7]/20";
const labelClass = "mb-1.5 block text-sm font-semibold text-[#0a2540]";

export function PublicRequestForm({ defaultNoPelanggan = "" }: { defaultNoPelanggan?: string }) {
  const [phase, setPhase] = useState<"form" | "otp" | "done">("form");
  const [otpId, setOtpId] = useState("");
  const [emailMasked, setEmailMasked] = useState("");
  const [noTiket, setNoTiket] = useState("");
  // Disimpan saat submit supaya layar konfirmasi bisa menautkan langsung ke
  // jalur lacak "No. Tiket + No. Pelanggan" tanpa meminta pengguna mengetik ulang.
  const [noPelanggan, setNoPelanggan] = useState(defaultNoPelanggan);
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nop = String(fd.get("noPelanggan") ?? "").trim();
    setNoPelanggan(nop);
    setError(undefined);
    start(async () => {
      const r = await submitPermintaan(fd);
      if (r.status === "otp") {
        setOtpId(r.otpId!);
        setEmailMasked(r.emailMasked!);
        setPhase("otp");
      } else if (r.status === "done") {
        setNoTiket(r.noTiket!);
        simpanRiwayatLokal(r.noTiket!, nop);
        setPhase("done");
      } else setError(r.error);
    });
  }

  function onVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("otpId", otpId);
    setError(undefined);
    setInfo(undefined);
    start(async () => {
      const r = await verifyOtp(fd);
      if (r.status === "done") {
        setNoTiket(r.noTiket!);
        simpanRiwayatLokal(r.noTiket!, noPelanggan);
        setPhase("done");
      } else setError(r.error);
    });
  }

  function onResend() {
    setError(undefined);
    setInfo(undefined);
    start(async () => {
      const r = await resendOtp(otpId);
      if (r.ok) setInfo("Kode baru telah dikirim ke email Anda.");
      else setError(r.error);
    });
  }

  // --- DONE ---
  if (phase === "done") {
    return (
      <div className="rounded-2xl border border-[#86efac] bg-[#f0fdf4] p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#16a34a] text-white">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-lg font-bold text-[#166534]">Laporan terkonfirmasi</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-[#0a2540]/70">
          Email Anda terverifikasi dan permintaan resmi masuk antrian. Nomor tiket:
        </p>
        <p className="tj-display mt-3 select-all text-2xl font-extrabold tracking-wide text-[#0284c7]">
          {noTiket}
        </p>

        {/* Butir 3.3 — nomor tiket tidak lagi hanya "tampil sekali lalu hilang". */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <SalinTeks teks={noTiket} className="bg-white" />
          <a
            href={
              noPelanggan
                ? tautanLacak({ noTiket, noPelanggan, disimpanPada: Date.now() })
                : "/lacak"
            }
            className="inline-block rounded-xl bg-[#0284c7] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0369a1]"
          >
            Lacak permintaan ini
          </a>
        </div>

        <p className="mt-4 text-xs text-[#0a2540]/55">
          Nomor ini juga kami kirim ke email Anda, dan tersimpan di peramban
          perangkat ini agar muncul otomatis di halaman lacak.
        </p>
      </div>
    );
  }

  // --- OTP STEP ---
  if (phase === "otp") {
    return (
      <form onSubmit={onVerify} className="space-y-4">
        <div className="rounded-xl bg-[#e0f2fe] px-4 py-3 text-sm text-[#0369a1]">
          Kami mengirim <strong>kode 6 digit</strong> ke <strong>{emailMasked}</strong>. Buka inbox
          (atau folder spam) dan masukkan kodenya untuk mengonfirmasi laporan Anda.
        </div>
        {error && (
          <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">{error}</div>
        )}
        {info && (
          <div className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm text-[#166534]">{info}</div>
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
          {pending ? "Memverifikasi…" : "Konfirmasi Laporan"}
        </button>

        <div className="flex items-center justify-between text-sm">
          <button type="button" onClick={() => { setPhase("form"); setError(undefined); }} className="text-[#0a2540]/60 hover:underline">
            ← Ubah data
          </button>
          <button type="button" onClick={onResend} disabled={pending} className="font-semibold text-[#0284c7] hover:underline disabled:opacity-60">
            Kirim ulang kode
          </button>
        </div>
      </form>
    );
  }

  // --- FORM STEP ---
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">{error}</div>
      )}

      <div>
        <label className={labelClass}>No. Pelanggan</label>
        <input
          name="noPelanggan"
          inputMode="numeric"
          maxLength={9}
          required
          defaultValue={defaultNoPelanggan}
          placeholder="9 digit, contoh: 197600003"
          className={inputClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>No. HP</label>
          <input name="noHp" inputMode="tel" required placeholder="08xxxxxxxxxx" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input name="email" type="email" required placeholder="nama@email.com" className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Keluhan / keterangan</label>
        <textarea name="keluhan" required rows={3} placeholder="Jelaskan kebutuhan suplai air Anda" className={inputClass} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-[#0284c7] p-4 font-semibold text-white shadow-lg shadow-[#0284c7]/25 transition hover:bg-[#0369a1] disabled:opacity-60"
      >
        {pending ? "Mengirim kode…" : "Ajukan Permintaan"}
      </button>
      <p className="text-center text-xs text-[#0a2540]/50">
        Kami akan mengirim kode verifikasi ke email Anda untuk memastikan laporan benar-benar masuk.
      </p>
    </form>
  );
}
