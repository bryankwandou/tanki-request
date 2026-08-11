/**
 * Penerjemahan query string halaman Laporan menjadi filter yang bisa dipercaya
 * (Issue #1, FR-45..47). Murni — tanpa DB — supaya aturan batasnya bisa diuji.
 */
export const STATUS_TIKET = [
  "DITERIMA",
  "TERVERIFIKASI",
  "DIJADWALKAN",
  "DALAM_PERJALANAN",
  "SELESAI",
  "DITOLAK",
  "DIBATALKAN",
] as const;

export type StatusTiketName = (typeof STATUS_TIKET)[number];

export const STATUS_LABEL: Record<StatusTiketName, string> = {
  DITERIMA: "Diterima",
  TERVERIFIKASI: "Terverifikasi",
  DIJADWALKAN: "Dijadwalkan",
  DALAM_PERJALANAN: "Dalam Perjalanan",
  SELESAI: "Selesai",
  DITOLAK: "Ditolak",
  DIBATALKAN: "Dibatalkan",
};

/**
 * PDAM Makassar berada di WITA. Batas tanggal dihitung terhadap zona ini, bukan
 * zona server, supaya "1 Juli" pada laporan berarti 1 Juli menurut operator —
 * termasuk saat aplikasi dijalankan di container ber-TZ UTC seperti di CI.
 */
export const REPORT_UTC_OFFSET_HOURS = 8;

/** Rentang dibatasi supaya satu klik tidak memindai seluruh tabel tiket. */
export const MAX_RANGE_DAYS = 366;
export const DEFAULT_RANGE_DAYS = 30;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WIL_RE = /^\d{2}$/;
const RAYON_RE = /^\d{1,7}$/;

export type RawFilter = {
  from?: string;
  to?: string;
  status?: string;
  wil?: string;
  rayon?: string;
};

export type LaporanFilter = {
  /** yyyy-mm-dd, untuk mengisi ulang form. */
  fromLabel: string;
  toLabel: string;
  /** Batas query: [start, endExclusive). */
  start: Date;
  endExclusive: Date;
  status: StatusTiketName | null;
  wil: string | null;
  rayon: string | null;
};

function toDayStartUtc(label: string): Date {
  return new Date(`${label}T00:00:00.000Z`);
}

function labelOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** Hari ini menurut WITA, dinyatakan sebagai label yyyy-mm-dd. */
export function todayLabel(now: Date): string {
  return labelOf(new Date(now.getTime() + REPORT_UTC_OFFSET_HOURS * 3_600_000));
}

export function parseLaporanFilter(raw: RawFilter, now: Date): LaporanFilter {
  const today = todayLabel(now);

  let fromLabel = raw.from && DATE_RE.test(raw.from) ? raw.from : "";
  let toLabel = raw.to && DATE_RE.test(raw.to) ? raw.to : "";

  if (!toLabel) toLabel = today;
  if (!fromLabel) fromLabel = labelOf(shiftDays(toDayStartUtc(toLabel), -(DEFAULT_RANGE_DAYS - 1)));

  // Terbalik → tukar, bukan kembalikan nol baris. Operator yang keliru mengisi
  // urutan tanggal jauh lebih sering daripada yang benar-benar ingin nol baris.
  if (fromLabel > toLabel) [fromLabel, toLabel] = [toLabel, fromLabel];

  // Rentang terlalu lebar → potong dari sisi awal, ujung yang diminta dipertahankan.
  const spanDays =
    (toDayStartUtc(toLabel).getTime() - toDayStartUtc(fromLabel).getTime()) / 86_400_000 + 1;
  if (spanDays > MAX_RANGE_DAYS) {
    fromLabel = labelOf(shiftDays(toDayStartUtc(toLabel), -(MAX_RANGE_DAYS - 1)));
  }

  // Tanggal akhir bersifat INKLUSIF bagi operator. Karena createdAt menyimpan
  // waktu, batas atasnya harus awal hari berikutnya — memakai toDayStartUtc(to)
  // langsung akan membuang tiket yang dibuat pada hari terakhir itu sendiri.
  const offsetMs = REPORT_UTC_OFFSET_HOURS * 3_600_000;
  const start = new Date(toDayStartUtc(fromLabel).getTime() - offsetMs);
  const endExclusive = new Date(shiftDays(toDayStartUtc(toLabel), 1).getTime() - offsetMs);

  const status =
    raw.status && (STATUS_TIKET as readonly string[]).includes(raw.status)
      ? (raw.status as StatusTiketName)
      : null;

  return {
    fromLabel,
    toLabel,
    start,
    endExclusive,
    status,
    wil: raw.wil && WIL_RE.test(raw.wil) ? raw.wil : null,
    rayon: raw.rayon && RAYON_RE.test(raw.rayon) ? raw.rayon : null,
  };
}

/** Nama berkas ekspor — deterministik dan mencerminkan filter yang dipakai. */
export function exportFilename(f: LaporanFilter, ext: "csv" | "xlsx"): string {
  const bagian = ["laporan-tanki", f.fromLabel, "sd", f.toLabel];
  if (f.status) bagian.push(f.status.toLowerCase());
  if (f.wil) bagian.push(`wil${f.wil}`);
  if (f.rayon) bagian.push(`rayon${f.rayon}`);
  return `${bagian.join("_")}.${ext}`;
}
