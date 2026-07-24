import Signin from "@/components/Auth/Signin";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Login Operator",
};

export default function SignIn() {
  return (
    <div className="flex min-h-screen flex-wrap items-center">
      <div className="w-full xl:w-1/2">
        <div className="mx-auto w-full max-w-[480px] p-4 sm:p-12.5 xl:p-15">
          <Link href="/" className="mb-9 inline-flex items-center gap-2.5">
            <Image
              src="/images/logo/pdam-makassar.png"
              width={44}
              height={44}
              alt="PDAM Kota Makassar"
              className="h-10 w-10 object-contain"
            />
            <span className="text-2xl font-bold text-primary">
              Tanki Je&apos;ne&apos;
            </span>
          </Link>

          <p className="mb-1.5 font-medium text-dark dark:text-white">
            Dashboard Operator
          </p>
          <h1 className="mb-6 text-2xl font-bold text-dark dark:text-white sm:text-heading-3">
            Selamat Datang
          </h1>

          <Suspense fallback={<div>Memuat...</div>}>
            <Signin />
          </Suspense>
        </div>
      </div>

      <div className="hidden w-full p-6 xl:block xl:w-1/2">
        <div className="custom-gradient-1 overflow-hidden rounded-2xl px-15 pt-12.5 dark:bg-dark-2! dark:bg-none">
          <p className="mb-3 text-xl font-medium text-dark dark:text-white">
            Tanki Je&apos;ne&apos;
          </p>
          <h2 className="mb-4 text-2xl font-bold text-dark dark:text-white sm:text-heading-4">
            Sistem Informasi Permintaan Layanan Mobil Tangki
          </h2>
          <p className="w-full max-w-[375px] font-medium text-dark-4 dark:text-dark-6">
            PDAM Kota Makassar. Akses dashboard operator untuk verifikasi,
            penjadwalan armada, dan monitoring permintaan.
          </p>
        </div>
      </div>
    </div>
  );
}
