"use client";

import {
  KUNCI_RIWAYAT,
  bacaRiwayat,
  hapusEntri,
  tautanLacak,
  type EntriRiwayat,
} from "@/lib/tanki/riwayat-lokal";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Daftar permintaan yang pernah diajukan dari perangkat ini (butir 3.3 & 3.8).
 *
 * Ini jawaban tanpa-login untuk "riwayat permintaan": halaman lacak langsung
 * menawarkan tiket yang tersimpan di peramban, jadi pengguna tidak perlu
 * mengetik ulang apa pun. Berbeda dari riwayat berbasis akun, isinya hanya
 * berlaku di perangkat ini — dan itu dinyatakan terus terang di UI supaya
 * pengguna tidak menyangka datanya tersimpan di PDAM.
 *
 * Dirender setelah mount (bukan saat SSR) karena localStorage tidak ada di
 * server; sebelum itu komponen ini tidak menampilkan apa-apa.
 */
export function RiwayatLokalPanel() {
  const [daftar, setDaftar] = useState<EntriRiwayat[] | null>(null);

  useEffect(() => {
    try {
      setDaftar(bacaRiwayat(window.localStorage.getItem(KUNCI_RIWAYAT)));
    } catch {
      // Mode privasi / storage diblokir kebijakan peramban — fitur kenyamanan
      // ini tidak boleh menjatuhkan halaman lacak.
      setDaftar([]);
    }
  }, []);

  function hapus(noTiket: string) {
    const sisa = hapusEntri(daftar ?? [], noTiket);
    setDaftar(sisa);
    try {
      window.localStorage.setItem(KUNCI_RIWAYAT, JSON.stringify(sisa));
    } catch {
      /* diabaikan — state di layar sudah benar */
    }
  }

  if (!daftar || daftar.length === 0) return null;

  return (
    <section className="mt-6 rounded-2xl border border-[#e0f2fe] bg-white p-5 shadow-sm sm:p-6">
      <h2 className="tj-display text-base font-bold text-[#0a2540]">
        Permintaan dari perangkat ini
      </h2>
      <p className="mt-1 text-xs text-[#0a2540]/55">
        Tersimpan di peramban Anda sendiri, bukan di server PDAM. Hapus riwayat
        peramban akan menghapusnya juga.
      </p>

      <ul className="mt-4 space-y-2">
        {daftar.map((e) => (
          <li
            key={e.noTiket}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e0f2fe] px-4 py-3"
          >
            <div>
              <Link
                href={tautanLacak(e)}
                className="tj-display font-bold text-[#0369a1] hover:underline"
              >
                {e.noTiket}
              </Link>
              <div className="text-xs text-[#0a2540]/50">
                No. Pelanggan {e.noPelanggan} ·{" "}
                {new Date(e.disimpanPada).toLocaleDateString("id-ID")}
              </div>
            </div>
            <button
              type="button"
              onClick={() => hapus(e.noTiket)}
              className="text-xs font-semibold text-[#0a2540]/45 transition hover:text-[#b91c1c]"
            >
              Hapus
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
