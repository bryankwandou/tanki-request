import { keluarSesiPelanggan, nopSesi } from "@/app/(public)/actions";
import { db } from "@/lib/db";
import { STATUS_LABEL } from "@/lib/tanki/status";
import type { StatusTiket } from "@/generated/prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Riwayat Permintaan" };
export const dynamic = "force-dynamic";

const STOPPED: StatusTiket[] = ["DITOLAK", "DIBATALKAN"];

/**
 * Riwayat permintaan tanpa mengetik apa pun (butir 3.8 laporan review).
 *
 * Laporan meminta riwayat ditampilkan sebagai DAFTAR — bukan satu tiket
 * terakhir — supaya pengguna bisa melihat pola permintaan sebelumnya, yang
 * sekaligus membantu mereka memahami kenapa pengajuan baru tertahan cooldown
 * (butir 3.4).
 *
 * Aksesnya bersandar pada cookie sesi bertanda tangan yang hanya terbit
 * setelah verifikasi OTP email berhasil. Tidak ada No. Pelanggan yang bisa
 * diketik di halaman ini: kalau ada, halaman ini akan jadi jalan pintas
 * membaca riwayat orang lain tanpa bukti kepemilikan apa pun.
 */
export default async function RiwayatPage() {
  const nop = await nopSesi();
  if (!nop) redirect("/lacak");

  const tiket = await db.tiket.findMany({
    where: { noPelanggan: nop },
    orderBy: { createdAt: "desc" },
    take: 50,
    // Kolom disebut satu per satu — email dan No. HP pelapor tidak dibutuhkan
    // halaman ini, jadi tidak ikut ditarik.
    select: { id: true, noTiket: true, status: true, keluhan: true, createdAt: true },
  });

  async function keluar() {
    "use server";
    await keluarSesiPelanggan();
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0369a1] transition hover:underline"
      >
        <span aria-hidden="true">←</span> Kembali ke Beranda
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="tj-display text-2xl font-extrabold text-[#0a2540] sm:text-3xl">
            Riwayat permintaan
          </h1>
          <p className="mt-2 text-sm text-[#0a2540]/65">
            No. Pelanggan <strong>{nop}</strong> — terverifikasi lewat email Anda.
          </p>
        </div>
        <form action={keluar}>
          <button
            type="submit"
            className="rounded-xl border border-[#cbd5e1] px-4 py-2 text-sm font-semibold text-[#0a2540]/70 transition hover:bg-[#f1f5f9]"
          >
            Keluar
          </button>
        </form>
      </div>

      {tiket.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-[#e0f2fe] bg-white p-8 text-center text-[#0a2540]/60 shadow-sm">
          Belum ada permintaan atas nomor pelanggan ini.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {tiket.map((t) => (
            <li
              key={t.id.toString()}
              className="rounded-2xl border border-[#e0f2fe] bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/lacak?mode=tiket&tiket=${t.noTiket}&nop=${nop}`}
                  className="tj-display text-lg font-bold text-[#0369a1] hover:underline"
                >
                  {t.noTiket}
                </Link>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    STOPPED.includes(t.status)
                      ? "bg-[#fee2e2] text-[#b91c1c]"
                      : "bg-[#e0f2fe] text-[#0369a1]"
                  }`}
                >
                  {STATUS_LABEL[t.status]}
                </span>
              </div>
              <p className="mt-2 text-sm text-[#0a2540]/65">{t.keluhan}</p>
              <p className="mt-1 text-xs text-[#0a2540]/45">
                Diajukan {t.createdAt.toLocaleString("id-ID")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
