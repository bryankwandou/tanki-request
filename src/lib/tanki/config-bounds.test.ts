import { describe, expect, it } from "vitest";
import { CONFIG_DEFAULTS, NUMERIC_BOUNDS, renderTemplate } from "./config-schema";

/**
 * Salinan logika clamp di saveKonfigurasi (konfigurasi/actions.ts).
 * Diuji terpisah karena server action-nya butuh sesi + database; yang perlu
 * dibuktikan di sini murni "nilai apa yang akhirnya tersimpan".
 */
function clampInput(key: keyof typeof CONFIG_DEFAULTS, raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return CONFIG_DEFAULTS[key];
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return CONFIG_DEFAULTS[key];
  const b = NUMERIC_BOUNDS[key];
  if (!b) return String(Math.floor(n));
  return String(Math.min(b.max, Math.max(b.min, Math.floor(n))));
}

describe("drift default — fallback merujuk CONFIG_DEFAULTS", () => {
  it("otp_ttl_minutes kosong kembali ke 10, bukan 5", () => {
    // Bug lama: literal "5" diketik ulang di saveKonfigurasi padahal default "10",
    // jadi admin yang mengosongkan field diam-diam memangkas TTL jadi separuhnya.
    expect(CONFIG_DEFAULTS.otp_ttl_minutes).toBe("10");
    expect(clampInput("otp_ttl_minutes", "")).toBe("10");
    expect(clampInput("otp_ttl_minutes", "   ")).toBe("10");
  });

  it("setiap key numerik punya default yang berada di dalam rentangnya sendiri", () => {
    for (const [key, b] of Object.entries(NUMERIC_BOUNDS)) {
      const def = Number(CONFIG_DEFAULTS[key as keyof typeof CONFIG_DEFAULTS]);
      expect(def, `${key} default di luar rentang`).toBeGreaterThanOrEqual(b.min);
      expect(def, `${key} default di luar rentang`).toBeLessThanOrEqual(b.max);
    }
  });
});

describe("clamp sisi server — atribut min/max HTML bukan kontrol keamanan", () => {
  it("otp_length terlalu pendek dinaikkan ke batas bawah", () => {
    // "2" berarti hanya 100 kemungkinan kode.
    expect(clampInput("otp_length", "2")).toBe("4");
    expect(clampInput("otp_length", "0")).toBe("4");
    expect(clampInput("otp_length", "-5")).toBe("4");
  });

  it("otp_ttl_minutes terlalu panjang diturunkan ke batas atas", () => {
    // "10000" membuat kode berlaku seminggu.
    expect(clampInput("otp_ttl_minutes", "10000")).toBe("60");
  });

  it("otp_max_attempts tidak bisa dibuat meniadakan cap-nya sendiri", () => {
    // Issue #4 (Critical) bersandar pada cap ini.
    expect(clampInput("otp_max_attempts", "9999")).toBe("10");
    expect(clampInput("otp_max_attempts", "1")).toBe("3");
    expect(clampInput("otp_max_attempts", "5")).toBe("5");
  });

  it("nilai bukan angka jatuh ke default, bukan NaN", () => {
    expect(clampInput("otp_max_attempts", "banyak")).toBe("5");
    expect(clampInput("otp_length", "enam")).toBe("6");
    // Infinity bukan nilai hingga → jatuh ke default, bukan di-clamp ke batas atas.
    expect(clampInput("rate_limit_per_hour", "Infinity")).toBe(CONFIG_DEFAULTS.rate_limit_per_hour);
  });

  it("pecahan dibulatkan ke bawah lalu di-clamp", () => {
    expect(clampInput("otp_length", "6.9")).toBe("6");
    expect(clampInput("otp_length", "3.9")).toBe("4");
  });

  it("smtp_port dibatasi rentang port yang sah", () => {
    expect(clampInput("smtp_port", "99999")).toBe("65535");
    expect(clampInput("smtp_port", "0")).toBe("1");
    expect(clampInput("smtp_port", "1025")).toBe("1025");
  });
});

describe("renderTemplate — placeholder template email", () => {
  it("mengisi placeholder yang dikenal", () => {
    expect(renderTemplate("Kode: {{kode}}, berlaku {{ttl}} menit", { kode: "123456", ttl: "10" })).toBe(
      "Kode: 123456, berlaku 10 menit",
    );
  });

  it("membiarkan placeholder yang salah ketik apa adanya", () => {
    // Admin melihat {{no_tikett}} di email tes dan tahu penyebabnya,
    // alih-alih menemukan kalimat yang bolong.
    expect(renderTemplate("Tiket {{no_tikett}}", { no_tiket: "TJ-1" })).toBe("Tiket {{no_tikett}}");
  });

  it("mentoleransi spasi di dalam kurung", () => {
    expect(renderTemplate("{{ kode }}", { kode: "999" })).toBe("999");
  });

  it("mengganti semua kemunculan, bukan yang pertama saja", () => {
    expect(renderTemplate("{{a}}-{{a}}-{{a}}", { a: "x" })).toBe("x-x-x");
  });

  it("nilai kosong menghasilkan string kosong, bukan placeholder tersisa", () => {
    expect(renderTemplate("Status{{alasan}}", { alasan: "" })).toBe("Status");
  });

  it("template default bawaan ter-render lengkap tanpa sisa placeholder", () => {
    const rendered = [
      renderTemplate(CONFIG_DEFAULTS.tpl_otp_subject, { kode: "123456", ttl: "10" }),
      renderTemplate(CONFIG_DEFAULTS.tpl_otp_body, { kode: "123456", ttl: "10" }),
      renderTemplate(CONFIG_DEFAULTS.tpl_tiket_subject, { no_tiket: "TJ-1" }),
      renderTemplate(CONFIG_DEFAULTS.tpl_tiket_body, { no_tiket: "TJ-1" }),
      renderTemplate(CONFIG_DEFAULTS.tpl_status_subject, { no_tiket: "TJ-1", status: "Selesai", alasan: "" }),
      renderTemplate(CONFIG_DEFAULTS.tpl_status_body, { no_tiket: "TJ-1", status: "Selesai", alasan: "" }),
    ];
    for (const out of rendered) expect(out).not.toMatch(/\{\{/);
  });
});
