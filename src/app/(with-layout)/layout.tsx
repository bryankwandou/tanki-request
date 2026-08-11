import { Header } from "@/components/Layouts/header";
import { Sidebar } from "@/components/Layouts/sidebar";
import { auth } from "@/lib/auth";
import { canAccessApp } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { type PropsWithChildren } from "react";

export default async function WithLayout({ children }: PropsWithChildren) {
  const session = await auth();

  if (!session || session.error === "RefreshTokenError") {
    redirect("/auth/sign-in");
  }

  const allowed = canAccessApp(session);

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="w-full bg-gray-2 dark:bg-[#020d1a]">
        <Header />

        <main className="isolate mx-auto w-full max-w-(--breakpoint-2xl) overflow-hidden p-4 md:p-6 2xl:p-10">
          {allowed ? (
            children
          ) : (
            <div className="rounded-[10px] bg-white p-8 text-center shadow-1 dark:bg-gray-dark">
              <h2 className="mb-2 text-heading-6 font-bold text-dark dark:text-white">
                Akses ditolak
              </h2>
              <p className="text-dark-5 dark:text-dark-6">
                Akun Anda belum memiliki role <code>app-tanki</code> untuk
                aplikasi Tanki Je&apos;ne&apos;. Hubungi admin Keycloak PDAM.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
