import "@/css/public.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { type PropsWithChildren } from "react";

const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

export default function PublicLayout({ children }: PropsWithChildren) {
  return (
    <div
      className={`${display.variable} flex min-h-screen flex-col bg-[#f0f9ff] text-[#0a2540]`}
    >
      {/*
        Header sengaja TIDAK sticky.

        Versi sebelumnya melayang di atas konten (`sticky top-0` dengan latar
        semi-transparan), sehingga pada layar pendek dan pada tingkat zoom
        rendah ia menutupi bagian atas isi halaman. Header yang menetap membuat
        posisinya bisa diprediksi: ia menggulung bersama halaman seperti elemen
        lain. Latarnya dibuat penuh — transparansi dan blur hanya berguna
        selagi ia melayang.
      */}
      <header className="border-b border-[#e0f2fe] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/images/logo/pdam-makassar.png"
              width={44}
              height={44}
              alt="PDAM Kota Makassar"
              className="h-9 w-9 object-contain sm:h-11 sm:w-11"
              priority
            />
            <span className="leading-tight">
              <span className="tj-display block text-base font-extrabold text-[#0a2540] sm:text-lg">
                Tanki Je&apos;ne&apos;
              </span>
              <span className="block text-[10px] text-[#0369a1] sm:text-[11px]">
                PDAM Kota Makassar
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            {/*
              Butir 3.6 — masuk bersifat OPSIONAL, jadi ia berdampingan dengan
              lacak, bukan menggantikannya dan bukan gerbang di depan apa pun.
            */}
            <Link
              href="/masuk"
              className="rounded-full px-3 py-2 text-xs font-semibold text-[#0369a1] transition hover:bg-[#e0f2fe] sm:px-3.5 sm:text-sm"
            >
              Masuk
            </Link>
            <Link
              href="/lacak"
              className="rounded-full border border-[#bae6fd] px-3.5 py-2 text-xs font-semibold text-[#0369a1] transition hover:bg-[#e0f2fe] sm:px-4 sm:text-sm"
            >
              Lacak Permintaan
            </Link>
          </div>
        </div>
      </header>

      {/*
        `flex-1` mendorong footer ke dasar layar saat isi halaman lebih pendek
        dari jendela. Tanpa ini, footer berhenti tepat di bawah isi dan
        menyisakan pita latar biru di bawahnya.
      */}
      <main className="flex-1">{children}</main>

      <footer className="border-t border-[#e0f2fe] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-7 text-center text-xs text-[#0a2540]/55 sm:px-6 sm:text-sm">
          © PDAM Kota Makassar — Layanan Mobil Tangki <span className="tj-display font-semibold">Tanki Je&apos;ne&apos;</span>
        </div>
      </footer>
    </div>
  );
}
