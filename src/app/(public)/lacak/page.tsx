import { extractClientIp, rateLimit } from "@/lib/tanki/rate-limit";
import { db } from "@/lib/db";
import { STATUS_LABEL } from "@/lib/tanki/status";
import type { StatusTiket } from "@/generated/prisma/client";
import type { Metadata } from "next";
import { headers } from "next/headers";

export const metadata: Metadata = { title: "Lacak Permintaan" };
export const dynamic = "force-dynamic";

const PCT: Record<StatusTiket, number> = {
  DITERIMA: 20,
  TERVERIFIKASI: 40,
  DIJADWALKAN: 60,
  DALAM_PERJALANAN: 85,
  SELESAI: 100,
  DITOLAK: 100,
  DIBATALKAN: 100,
};
const STOPPED: StatusTiket[] = ["DITOLAK", "DIBATALKAN"];

type Search = { nop?: string; hp?: string };

const inputClass =
  "w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-[#0a2540] outline-none transition focus:border-[#0284c7] focus:ring-2 focus:ring-[#0284c7]/20";

export default async function LacakPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { nop, hp } = await searchParams;
  const hasQuery = Boolean(nop && hp);

  // Rate limit: /lacak searches — max 30 per IP per 10 menit (FR-08 extension)
  let rateLimited = false;
  if (hasQuery) {
    const h = await headers();
    const ip = extractClientIp(h.get("x-forwarded-for"), h.get("x-real-ip"));
    const rl = await rateLimit(`lacak:ip:${ip}`, 30, 10 * 60_000);
    rateLimited = !rl.allowed;
  }

  // Input validation: noPelanggan must be 9 digits, noHp must start with 0
  const nopValid = !nop || /^\d{9}$/.test(nop);
  const hpValid = !hp || /^0\d{8,13}$/.test(hp);
  const inputValid = nopValid && hpValid;

  const tiket =
    hasQuery && !rateLimited && inputValid
      ? await db.tiket.findMany({
          where: { noPelanggan: nop, noHp: hp },
          orderBy: { createdAt: "desc" },
          // Only expose fields the public needs — exclude operator notes (catatan)
          include: {
            riwayat: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                status: true,
                createdAt: true,
                // catatan (operator note) is intentionally NOT selected here
              },
            },
          },
        })
      : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="tj-display text-2xl font-extrabold text-[#0a2540] sm:text-3xl">
        Lacak permintaan Anda
      </h1>
      <p className="mt-2 text-sm text-[#0a2540]/65 sm:text-base">
        Masukkan No. Pelanggan dan No. HP yang Anda pakai saat mengajukan.
      </p>

      <form
        method="get"
        className="mt-6 grid gap-4 rounded-2xl border border-[#e0f2fe] bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-6"
      >
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-[#0a2540]">No. Pelanggan</label>
          <input name="nop" defaultValue={nop ?? ""} required maxLength={9} inputMode="numeric" className={inputClass} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-[#0a2540]">No. HP</label>
          <input name="hp" defaultValue={hp ?? ""} required inputMode="tel" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="w-full rounded-xl bg-[#0284c7] p-3.5 font-semibold text-white shadow-lg shadow-[#0284c7]/25 transition hover:bg-[#0369a1]"
          >
            Lacak
          </button>
        </div>
      </form>

      {rateLimited && (
        <div className="mt-6 rounded-2xl border border-[#fee2e2] bg-[#fff1f2] p-5 text-center text-sm text-[#b91c1c]">
          Terlalu banyak pencarian dari jaringan Anda. Coba lagi beberapa menit lagi.
        </div>
      )}

      {!inputValid && hasQuery && (
        <div className="mt-6 rounded-2xl border border-[#fee2e2] bg-[#fff1f2] p-5 text-center text-sm text-[#b91c1c]">
          Format No. Pelanggan atau No. HP tidak valid.
        </div>
      )}

      {hasQuery && !rateLimited && inputValid && (
        <div className="mt-6 space-y-5">
          {tiket.length === 0 ? (
            <div className="rounded-2xl border border-[#e0f2fe] bg-white p-8 text-center text-[#0a2540]/60 shadow-sm">
              Tidak ada permintaan yang cocok dengan data tersebut.
            </div>
          ) : (
            tiket.map((t) => {
              const stopped = STOPPED.includes(t.status);
              const pct = PCT[t.status];
              return (
                <article key={t.id.toString()} className="overflow-hidden rounded-2xl border border-[#e0f2fe] bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e0f2fe] px-5 py-4 sm:px-6">
                    <span className="tj-display text-lg font-bold text-[#0a2540]">{t.noTiket}</span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        stopped ? "bg-[#fee2e2] text-[#b91c1c]" : "bg-[#e0f2fe] text-[#0369a1]"
                      }`}
                    >
                      {STATUS_LABEL[t.status]}
                    </span>
                  </div>

                  <div className="px-5 py-5 sm:px-6">
                    {/* Water-level progress (signature) */}
                    <div className="h-3 w-full overflow-hidden rounded-full bg-[#e0f2fe]">
                      <div
                        className={stopped ? "h-full rounded-full bg-[#ef4444]" : "tj-water h-full rounded-full"}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-[#0a2540]/60">{t.keluhan}</p>

                    {/* Droplet timeline */}
                    <ol className="mt-5 space-y-4">
                      {t.riwayat.map((r) => (
                        <li key={r.id.toString()} className="flex gap-3">
                          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0284c7]" />
                          <div>
                            <div className="text-sm font-semibold text-[#0a2540]">{STATUS_LABEL[r.status]}</div>
                            <div className="text-xs text-[#0a2540]/50">{r.createdAt.toLocaleString("id-ID")}</div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
