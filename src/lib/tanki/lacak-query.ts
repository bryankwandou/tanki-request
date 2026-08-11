/**
 * Normalisasi parameter halaman /lacak (butir 3.7 laporan review).
 *
 * Laporan meminta jalur kedua: melacak dengan nomor tiket, untuk pengguna yang
 * memegang email/tangkapan layar konfirmasi tapi lupa No. HP yang dipakai.
 *
 * PENTING — jalur ini TIDAK menerima nomor tiket sendirian. Format tiket
 * `TJ-YYYYMMDD-XXXX` hanya punya empat karakter acak per hari, jadi "lacak
 * cukup dengan nomor tiket" berarti data pelapor (nama, alamat, keluhan) bisa
 * dipanen dengan menebak ribuan kombinasi per tanggal. Karena itu jalur ini
 * meminta nomor tiket + No. Pelanggan: tetap menolong pengguna yang lupa No. HP
 * (keluhan asli di laporan), tanpa membuka permukaan enumerasi baru.
 *
 * Murni, tanpa I/O — supaya keputusan "query mana yang dijalankan" bisa diuji
 * tanpa database.
 */

import { NO_TIKET_RE } from "./no-tiket";

export const NOP_RE = /^\d{9}$/;
export const HP_RE = /^0\d{8,13}$/;

export type LacakParams = {
  nop?: string;
  hp?: string;
  tiket?: string;
  mode?: string;
};

export type LacakQuery =
  /** Belum ada yang dicari — form kosong, jangan sentuh database. */
  | { kind: "kosong" }
  /**
   * Ada usaha pencarian, tapi bentuk inputnya salah. Pemanggil WAJIB merender
   * ini persis seperti "tidak ada yang cocok" (Issue #6): pesan terpisah
   * "format tidak valid" akan memberi tahu penebak mana tebakan yang berbentuk
   * benar. Tidak ada query yang dijalankan.
   */
  | { kind: "malformed" }
  | { kind: "pelanggan"; noPelanggan: string; noHp: string }
  | { kind: "tiket"; noTiket: string; noPelanggan: string };

const bersih = (v: string | undefined) => (v ?? "").trim();

/** Nomor tiket disamakan huruf besar & spasi supaya tempelan dari email tetap cocok. */
export function normalisasiNoTiket(v: string | undefined): string {
  return bersih(v).toUpperCase().replace(/\s+/g, "");
}

export function parseLacak(params: LacakParams): LacakQuery {
  const mode = bersih(params.mode);
  const nop = bersih(params.nop);
  const hp = bersih(params.hp);
  const noTiket = normalisasiNoTiket(params.tiket);

  if (mode === "tiket") {
    if (!noTiket && !nop) return { kind: "kosong" };
    if (!NO_TIKET_RE.test(noTiket) || !NOP_RE.test(nop)) return { kind: "malformed" };
    return { kind: "tiket", noTiket, noPelanggan: nop };
  }

  if (!nop && !hp) return { kind: "kosong" };
  if (!NOP_RE.test(nop) || !HP_RE.test(hp)) return { kind: "malformed" };
  return { kind: "pelanggan", noPelanggan: nop, noHp: hp };
}
