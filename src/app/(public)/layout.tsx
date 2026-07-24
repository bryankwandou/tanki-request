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
    <div className={`${display.variable} min-h-screen bg-[#f0f9ff] text-[#0a2540]`}>
      <header className="sticky top-0 z-30 border-b border-[#e0f2fe] bg-white/85 backdrop-blur">
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

          <Link
            href="/lacak"
            className="rounded-full border border-[#bae6fd] px-3.5 py-2 text-xs font-semibold text-[#0369a1] transition hover:bg-[#e0f2fe] sm:px-4 sm:text-sm"
          >
            Lacak Permintaan
          </Link>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-[#e0f2fe] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-7 text-center text-xs text-[#0a2540]/55 sm:px-6 sm:text-sm">
          © PDAM Kota Makassar — Layanan Mobil Tangki <span className="tj-display font-semibold">Tanki Je&apos;ne&apos;</span>
        </div>
      </footer>
    </div>
  );
}
