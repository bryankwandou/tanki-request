import "@/css/satoshi.css";
import "@/css/style.css";

import "flatpickr/dist/flatpickr.min.css";
import "jsvectormap/dist/jsvectormap.css";

import type { Metadata } from "next";
import NextTopLoader from "nextjs-toploader";
import type { PropsWithChildren } from "react";
import { Toaster } from "sonner";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    template: "%s | Tanki Je'ne' - PDAM Kota Makassar",
    default: "Tanki Je'ne' - Layanan Mobil Tangki PDAM Kota Makassar",
  },
  description:
    "Sistem Informasi Permintaan Layanan Mobil Tangki PDAM Kota Makassar — ajukan permintaan, pantau antrian, dan kelola dispatch armada.",
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body>
        <Providers>
          <NextTopLoader color="#0284C7" showSpinner={false} />

          {children}

          <Toaster
            position="bottom-right"
            richColors
            closeButton
            duration={5000}
            toastOptions={{
              className: "dark:bg-gray-dark dark:border-dark-3 dark:text-white",
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
