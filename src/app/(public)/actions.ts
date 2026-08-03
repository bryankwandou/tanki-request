"use server";

import { getConfig } from "@/lib/tanki/config";
import { createPendingRequest, resendPendingOtp, verifyPendingOtp } from "@/lib/tanki/otp";
import { extractClientIp, rateLimit } from "@/lib/tanki/rate-limit";
import { createTiket } from "@/lib/tanki/tiket";
import { cookies, headers } from "next/headers";
import { z } from "zod";

/**
 * Cookie pengikat sesi OTP (Issue #4, lapis kedua di atas `token`).
 *
 * HttpOnly supaya tidak terbaca JavaScript mana pun di halaman publik.
 * SameSite=Strict karena alur ini tidak pernah dimasuki dari situs lain —
 * satu-satunya jalan sah adalah pengguna yang baru saja submit form di sini.
 * `secure` mengikuti produksi supaya development lewat http tetap jalan.
 */
const OTP_COOKIE = "tj_otp_sesi";

async function setOtpCookie(secret: string, ttlMenit: number) {
  (await cookies()).set(OTP_COOKIE, secret, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttlMenit * 60,
  });
}

async function getOtpCookie(): Promise<string | undefined> {
  return (await cookies()).get(OTP_COOKIE)?.value;
}

async function clearOtpCookie() {
  (await cookies()).delete(OTP_COOKIE);
}

export type FormState = {
  status: "idle" | "otp" | "done" | "error";
  error?: string;
  otpId?: string;
  emailMasked?: string;
  ttl?: number;
  noTiket?: string;
};

const schema = z.object({
  noPelanggan: z.string().trim().regex(/^\d{9}$/, "Nomor Pelanggan harus 9 digit angka."),
  noHp: z.string().trim().regex(/^0\d{8,13}$/, "Nomor HP tidak valid (mis. 08xxxxxxxxxx)."),
  email: z.string().trim().email("Email wajib diisi & valid (untuk verifikasi)."),
  keluhan: z.string().trim().min(5, "Keluhan minimal 5 karakter.").max(1000),
});

async function clientIp() {
  const h = await headers();
  return extractClientIp(
    h.get("x-forwarded-for"),
    h.get("x-real-ip"),
  );
}

export async function submitPermintaan(formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse({
    noPelanggan: formData.get("noPelanggan"),
    noHp: formData.get("noHp"),
    email: formData.get("email"),
    keluhan: formData.get("keluhan"),
  });
  if (!parsed.success)
    return { status: "error", error: parsed.error.issues[0]?.message ?? "Input tidak valid." };
  const data = parsed.data;

  const cfg = await getConfig();

  // Anti-bot/spam (FR-08/09) — per-IP + per-customer limits.
  const ip = await clientIp();
  if (!(await rateLimit(`submit:ip:${ip}`, 5, 10 * 60_000)).allowed)
    return { status: "error", error: "Terlalu banyak permintaan dari jaringan Anda. Coba lagi nanti." };
  const perHour = Number(cfg.rate_limit_per_hour) || 3;
  if (!(await rateLimit(`submit:cust:${data.noPelanggan}`, perHour, 60 * 60_000)).allowed)
    return { status: "error", error: "Terlalu banyak permintaan untuk Nomor Pelanggan ini. Coba lagi nanti." };

  // OTP = pertahanan utama: laporan baru dibuat setelah email diverifikasi.
  if (cfg.otp_enabled === "true") {
    const r = await createPendingRequest(data);
    if (!r.ok) return { status: "error", error: r.error };
    // Secret hanya berpindah ke cookie; ia tidak pernah masuk FormState, jadi
    // tidak pernah ikut ke komponen klien maupun payload RSC.
    await setOtpCookie(r.sessionSecret, r.ttl);
    return { status: "otp", otpId: r.otpId, emailMasked: r.emailMasked, ttl: r.ttl };
  }

  // Fallback (OTP dimatikan admin): buat langsung.
  const r = await createTiket(data);
  if (!r.ok) return { status: "error", error: r.error };
  return { status: "done", noTiket: r.noTiket };
}

export async function verifyOtp(formData: FormData): Promise<FormState> {
  const otpId = String(formData.get("otpId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { status: "otp", otpId, error: "Masukkan kode verifikasi." };

  // Throttle per-IP + per-email ada di dalam verifyPendingOtp, tempat email
  // permintaan diketahui. IP diresolusi di sini karena hanya server action yang
  // punya akses ke headers().
  const r = await verifyPendingOtp(otpId, code, await clientIp(), await getOtpCookie());
  if (!r.ok) return { status: "otp", otpId, error: r.error };

  // Sesi selesai — cookie tidak perlu hidup sampai TTL habis.
  await clearOtpCookie();
  return { status: "done", noTiket: r.noTiket };
}

export async function resendOtp(otpId: string): Promise<{ ok: boolean; error?: string }> {
  return resendPendingOtp(otpId, await clientIp(), await getOtpCookie());
}
