"use client";

import { useState } from "react";

/**
 * Tombol "Salin" (butir 3.3 laporan review).
 *
 * `navigator.clipboard` hanya ada di secure context (https / localhost). Di
 * jaringan internal PDAM lewat http biasa, ia `undefined` — jadi tombol yang
 * hanya memanggilnya akan diam tanpa kabar dan pengguna mengira nomornya
 * tersalin padahal tidak. Karena itu ada jalur cadangan `execCommand("copy")`,
 * dan bila keduanya gagal pengguna diberi tahu untuk menyalin manual.
 */
async function salin(teks: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(teks);
      return true;
    }
  } catch {
    // jatuh ke cadangan di bawah
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = teks;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function SalinTeks({
  teks,
  label = "Salin Nomor Tiket",
  className = "",
}: {
  teks: string;
  label?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "ok" | "gagal">("idle");

  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await salin(teks);
        setStatus(ok ? "ok" : "gagal");
        window.setTimeout(() => setStatus("idle"), 2500);
      }}
      // aria-live supaya pembaca layar ikut mendengar hasilnya, bukan hanya
      // pengguna yang melihat teks tombol berubah.
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-xl border border-[#bae6fd] px-4 py-2 text-sm font-semibold text-[#0369a1] transition hover:bg-[#e0f2fe] ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {status === "ok" ? "Tersalin!" : status === "gagal" ? "Salin manual ya" : label}
    </button>
  );
}
