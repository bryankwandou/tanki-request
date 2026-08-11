// Skema & kebijakan konfigurasi — murni, tanpa I/O.
//
// Dipisah dari config.ts (yang mengimpor @/lib/db) supaya default, batas nilai,
// dan renderer template bisa diuji tanpa database.

// Kunci konfigurasi sistem + default. Disimpan di tabel `konfigurasi` (key/value string).
export const CONFIG_DEFAULTS = {
  smtp_host: "",
  smtp_port: "587",
  smtp_secure: "false", // "true" untuk port 465
  smtp_user: "",
  smtp_pass: "", // rahasia — tidak pernah dikirim balik ke UI
  smtp_from: "noreply@pdam-makassar.go.id",
  otp_enabled: "true", // OTP email = pertahanan utama validasi laporan
  otp_ttl_minutes: "10",
  otp_length: "6",
  otp_max_attempts: "5", // FR-30 — percobaan salah per permintaan (tidak pulih saat kirim ulang)
  rate_limit_per_hour: "3",
  /**
   * Jeda wajib antar pengajuan untuk satu No. Pelanggan, dalam jam
   * (butir 3.4 laporan review UX & keamanan). "0" mematikan cooldown.
   * Berbeda dari rate_limit_per_hour: dihitung dari `created_at` tiket
   * terakhir di database, jadi tidak hilang saat Redis/proses restart.
   */
  submit_cooldown_hours: "24",
  /**
   * Mode ketat pencocokan No. HP (butir 3.4). "false" = pelanggan yang belum
   * punya kontak terdaftar tetap boleh mengajukan (perilaku lama); "true" =
   * tanpa kontak terdaftar, ditolak. Dinyalakan admin SETELAH data kontak
   * pelanggan dianggap lengkap — menyalakannya terlalu dini mengunci warga
   * yang datanya belum sempat dikumpulkan loket.
   */
  verifikasi_hp_wajib: "false",

  // --- Template email (FR-22/FR-32) ---
  // Placeholder ditulis {{nama}} dan diisi renderTemplate() di notify.ts.
  // Nilai di bawah = teks yang sebelumnya hardcoded, jadi perilaku default tidak berubah.
  // Sengaja TANPA {{kode}}. Kode di subjek terbaca dari pratinjau notifikasi di
  // layar kunci ponsel tanpa membuka email, dan ikut tercetak di mana pun subjek
  // di-log. Placeholder {{kode}} tetap tersedia bila admin memang menginginkannya.
  tpl_otp_subject: "Kode verifikasi permintaan Tanki Je'ne'",
  tpl_otp_body:
    "Kode verifikasi Anda: {{kode}}\n" +
    "Masukkan kode ini di halaman permintaan untuk mengonfirmasi laporan Anda.\n" +
    "Kode berlaku {{ttl}} menit. Abaikan email ini bila Anda tidak mengajukan permintaan.",
  tpl_tiket_subject: "Permintaan mobil tangki diterima — {{no_tiket}}",
  tpl_tiket_body:
    "Permintaan Anda telah kami terima dengan nomor tiket {{no_tiket}}.\n" +
    "Pantau progres lewat tautan berikut:\n{{tracking_url}}\n" +
    "Tautan berlaku 14 hari. Setelah itu, lacak dengan No. Pelanggan + No. HP Anda.",
  tpl_status_subject: "Update permintaan {{no_tiket}}: {{status}}",
  tpl_status_body: "Status permintaan {{no_tiket}} kini: {{status}}.{{alasan}}",
} as const;

export type ConfigKey = keyof typeof CONFIG_DEFAULTS;
export const SECRET_KEYS: ConfigKey[] = ["smtp_pass"];

/**
 * Batas nilai numerik yang diterima server.
 *
 * Pola `Number(x) || default` menyelamatkan kasus 0/NaN tapi meloloskan nilai
 * yang jelas keliru: otp_length "2" berarti 100 kemungkinan kode, otp_ttl_minutes
 * "10000" membuat kode berlaku seminggu, otp_max_attempts "9999" meniadakan guna
 * cap itu sendiri — padahal Issue #4 bersandar padanya.
 *
 * Form konfigurasi adalah server action, jadi atribut min/max di HTML BUKAN
 * kontrol keamanan. Clamp harus di sisi server, di sini.
 */
export const NUMERIC_BOUNDS: Record<string, { min: number; max: number }> = {
  smtp_port: { min: 1, max: 65535 },
  otp_ttl_minutes: { min: 1, max: 60 },
  otp_length: { min: 4, max: 8 },
  otp_max_attempts: { min: 3, max: 10 },
  rate_limit_per_hour: { min: 1, max: 20 },
  // Batas bawah 0 (= mati) memang disengaja: PDAM harus bisa mematikan cooldown
  // saat musim kemarau, ketika satu pelanggan wajar mengajukan berkali-kali.
  // Batas atas seminggu supaya salah ketik tidak mengunci pelanggan sebulan.
  submit_cooldown_hours: { min: 0, max: 168 },
};

/**
 * Baca nilai numerik dari config dengan clamp. Satu-satunya jalan masuk nilai
 * numerik konfigurasi ke kode aplikasi, supaya baris DB yang sudah terlanjur
 * kotor (mis. hasil edit manual) tetap tidak bisa melumpuhkan pertahanan.
 */
export function configNumber(cfg: Record<string, string>, key: ConfigKey): number {
  const bounds = NUMERIC_BOUNDS[key];
  const fallback = Number(CONFIG_DEFAULTS[key]);
  const raw = Number(cfg[key]);
  // Batas bawah menentukan apakah 0 adalah nilai yang sah. Untuk otp_length dkk
  // (min ≥ 1), "0" tetap berarti "isi rusak → pakai default". Untuk
  // submit_cooldown_hours (min 0), "0" adalah pilihan admin yang sah
  // ("matikan cooldown") dan tidak boleh diam-diam berubah jadi 24 jam.
  const batasBawah = bounds?.min ?? 1;
  const value = Number.isFinite(raw) && raw >= batasBawah ? raw : fallback;
  if (!bounds) return value;
  return Math.min(bounds.max, Math.max(bounds.min, Math.floor(value)));
}

/**
 * Isi placeholder `{{nama}}` pada template email (FR-22/FR-32).
 *
 * Placeholder yang tidak dikenal dibiarkan apa adanya, bukan dihapus — kalau
 * admin salah ketik, dia melihat `{{no_tikett}}` di email tes dan langsung tahu
 * penyebabnya, alih-alih menemukan kalimat yang bolong.
 */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
    Object.hasOwn(vars, key) ? vars[key] : whole,
  );
}

