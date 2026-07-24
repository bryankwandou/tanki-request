"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function Signin() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [loading, setLoading] = useState(false);

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          setLoading(true);
          signIn("keycloak", { callbackUrl });
        }}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary p-4 font-medium text-white transition hover:bg-opacity-90 disabled:opacity-60"
      >
        {loading ? "Mengalihkan ke Keycloak..." : "Masuk dengan Akun PDAM (Keycloak)"}
      </button>

      <p className="mt-6 text-center text-sm text-dark-5 dark:text-dark-6">
        Hanya untuk operator & admin PDAM. Anda akan dialihkan ke halaman SSO
        Keycloak (realm DIAMOND).
      </p>
    </div>
  );
}
