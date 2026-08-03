/**
 * Serialisasi CSV untuk ekspor Laporan (Issue #1). Murni supaya bisa diuji.
 */

/**
 * Sel yang diawali `=`, `+`, `-`, `@`, tab, atau CR diperlakukan Excel dan
 * LibreOffice sebagai formula saat berkas dibuka. Isi tabel ini berasal dari
 * input publik (nama, alamat, keluhan yang diketik pelapor), jadi tanpa penjagaan
 * ini sebuah laporan bisa membawa formula yang berjalan di komputer operator
 * ketika dibuka. Awalan kutip tunggal memaksa Excel membacanya sebagai teks.
 */
export function guardFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function csvCell(value: string): string {
  const v = guardFormula(value);
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; label: string }[],
): string {
  const head = columns.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((r) =>
    columns.map((c) => csvCell(String(r[c.key] ?? ""))).join(","),
  );
  // CRLF: Excel di Windows — target pemakai laporan ini — paling aman dengannya.
  return [head, ...body].join("\r\n") + "\r\n";
}

/**
 * BOM UTF-8. Tanpa ini Excel di Windows membaca berkas sebagai ANSI dan nama
 * jalan seperti "Jl. Andi Djemma" yang memuat karakter non-ASCII jadi rusak.
 */
export const UTF8_BOM = "﻿";
