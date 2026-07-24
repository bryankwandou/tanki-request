import type { StatusTiket } from "@/generated/prisma/client";

export const STATUS_LABEL: Record<StatusTiket, string> = {
  DITERIMA: "Diterima",
  TERVERIFIKASI: "Terverifikasi",
  DIJADWALKAN: "Dijadwalkan",
  DALAM_PERJALANAN: "Dalam Perjalanan",
  SELESAI: "Selesai",
  DITOLAK: "Ditolak",
  DIBATALKAN: "Dibatalkan",
};

export const ALL_STATUSES = Object.keys(STATUS_LABEL) as StatusTiket[];

export const ACTIVE_STATUSES: StatusTiket[] = [
  "DITERIMA",
  "TERVERIFIKASI",
  "DIJADWALKAN",
  "DALAM_PERJALANAN",
];

export const TERMINAL_STATUSES: StatusTiket[] = [
  "SELESAI",
  "DITOLAK",
  "DIBATALKAN",
];

// Transisi status yang diizinkan secara manual oleh operator.
// Catatan: DIJADWALKAN tidak di-set manual — diset saat membuat penugasan (dispatch).
export const ALLOWED_TRANSITIONS: Record<StatusTiket, StatusTiket[]> = {
  DITERIMA: ["TERVERIFIKASI", "DITOLAK"],
  TERVERIFIKASI: ["DITOLAK", "DIBATALKAN"], // → DIJADWALKAN lewat dispatch
  DIJADWALKAN: ["DALAM_PERJALANAN", "DIBATALKAN"],
  DALAM_PERJALANAN: ["SELESAI", "DIBATALKAN"],
  SELESAI: [],
  DITOLAK: [],
  DIBATALKAN: [],
};

export function canTransition(from: StatusTiket, to: StatusTiket): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// Status yang butuh alasan wajib.
export const REASON_REQUIRED: StatusTiket[] = ["DITOLAK", "DIBATALKAN"];

export function statusColor(s: StatusTiket): string {
  switch (s) {
    case "SELESAI":
      return "text-green";
    case "DITOLAK":
    case "DIBATALKAN":
      return "text-red";
    case "DALAM_PERJALANAN":
      return "text-orange-light";
    default:
      return "text-primary";
  }
}
