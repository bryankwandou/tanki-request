"use server";

import { getConfig } from "@/lib/tanki/config";
import { createPendingRequest, resendPendingOtp, verifyPendingOtp } from "@/lib/tanki/otp";
import { rateLimit } from "@/lib/tanki/rate-limit";
import { createTiket } from "@/lib/tanki/tiket";
import { headers } from "next/headers";
import { z } from "zod";

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
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
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

  // Anti-bot/spam (FR-08/09).
  const ip = await clientIp();
  if (!rateLimit(`ip:${ip}`, 5, 10 * 60_000).allowed)
    return { status: "error", error: "Terlalu banyak permintaan dari jaringan Anda. Coba lagi nanti." };
  const perHour = Number(cfg.rate_limit_per_hour) || 3;
  if (!rateLimit(`cust:${data.noPelanggan}`, perHour, 60 * 60_000).allowed)
    return { status: "error", error: "Terlalu banyak permintaan untuk Nomor Pelanggan ini. Coba lagi nanti." };

  // OTP = pertahanan utama: laporan baru dibuat setelah email diverifikasi.
  if (cfg.otp_enabled === "true") {
    const r = await createPendingRequest(data);
    if (!r.ok) return { status: "error", error: r.error };
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

  const r = await verifyPendingOtp(otpId, code);
  if (!r.ok) return { status: "otp", otpId, error: r.error };
  return { status: "done", noTiket: r.noTiket };
}

export async function resendOtp(otpId: string): Promise<{ ok: boolean; error?: string }> {
  return resendPendingOtp(otpId);
}
