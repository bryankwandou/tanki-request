import { nopSesi } from "@/app/(public)/actions";
import { MasukForm } from "@/components/tanki/masuk-form";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Masuk" };
export const dynamic = "force-dynamic";

/**
 * Masuk opsional (butir 3.6).
 *
 * Sebelumnya sesi hanya terbit sebagai efek samping verifikasi OTP saat
 * mengajukan tiket, sehingga warga yang sudah pernah dilayani tapi hanya ingin
 * melihat riwayatnya tidak punya jalan masuk. Halaman ini menutup celah itu
 * dengan infrastruktur OTP yang sama — tanpa sistem akun, tanpa kata sandi.
 */
export default async function MasukPage() {
  if (await nopSesi()) redirect("/riwayat");

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0369a1] transition hover:underline"
      >
        <span aria-hidden="true">←</span> Kembali ke Beranda
      </Link>

      <h1 className="tj-display mt-4 text-2xl font-extrabold text-[#0a2540] sm:text-3xl">
        Masuk
      </h1>
      <p className="mt-2 text-sm text-[#0a2540]/65">
        Lihat riwayat permintaan Anda tanpa mengetik ulang data. Kami mengirim
        kode verifikasi ke email yang Anda pakai saat mengajukan — tidak perlu
        membuat akun atau kata sandi.
      </p>

      <div className="mt-6 rounded-2xl border border-[#e0f2fe] bg-white p-5 shadow-sm sm:p-6">
        <MasukForm />
      </div>
    </div>
  );
}
