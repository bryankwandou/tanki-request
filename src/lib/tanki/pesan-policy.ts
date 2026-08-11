/**
 * Kebijakan pengiriman WhatsApp/SMS (butir 3.3 laporan review) — murni, tanpa I/O.
 *
 * Laporan meminta nomor tiket ikut dikirim lewat WhatsApp/SMS, bukan email saja:
 * banyak pelanggan PDAM tidak membuka email, tapi semuanya membuka WhatsApp.
 *
 * PDAM belum menunjuk penyedia gateway, dan itu keputusan pengadaan, bukan
 * keputusan teknis. Karena itu modul ini TIDAK mengikat satu vendor: ia
 * mengirim HTTP POST ke URL yang diisi admin, dengan payload yang bentuknya
 * juga diatur admin lewat template. Hampir semua gateway WA/SMS di Indonesia
 * (Wablas, Fonnte, Twilio, Zenziva, gateway internal) menerima pola itu.
 *
 * Selama URL belum diisi, jalurnya "DILEWATI" dan tercatat sebagai itu — bukan
 * mengaku TERKIRIM untuk pesan yang tidak pernah ada.
 */

export type ModePesan =
  /** Gateway dikonfigurasi → benar-benar kirim. */
  | "kirim"
  /** Belum dikonfigurasi → catat sebagai DILEWATI, jangan mengaku terkirim. */
  | "lewati"
  /** Dimatikan admin → tidak melakukan apa pun sama sekali. */
  | "mati";

export type KonfigPesan = {
  aktif: boolean;
  url: string;
  token: string;
};

export function resolveModePesan(k: KonfigPesan): ModePesan {
  if (!k.aktif) return "mati";
  if (!k.url.trim()) return "lewati";
  return "kirim";
}

/**
 * Bangun payload JSON dari template admin.
 *
 * Template ditulis sebagai JSON dengan placeholder, mis.
 *   {"target":"{{no_hp}}","message":"{{pesan}}","token":"{{token}}"}
 *
 * Nilai disisipkan lewat JSON.stringify per-nilai, BUKAN penempelan string
 * mentah: nomor tiket dan pesan bisa memuat tanda kutip, dan menempelkannya
 * mentah akan menghasilkan JSON rusak — atau, kalau isinya dikendalikan
 * penyerang, menyuntikkan field tambahan ke permintaan gateway.
 */
export function bangunPayload(
  template: string,
  vars: Record<string, string>,
): { ok: true; body: string } | { ok: false; error: string } {
  const terisi = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => {
    if (!Object.hasOwn(vars, key)) return whole;
    // stringify menghasilkan nilai BER-KUTIP; kutip pembungkus di template
    // dibuang oleh regex di bawah supaya hasilnya tidak berkutip ganda.
    return JSON.stringify(vars[key]).slice(1, -1);
  });

  try {
    JSON.parse(terisi);
    return { ok: true, body: terisi };
  } catch {
    return {
      ok: false,
      error: "Template payload bukan JSON yang sah setelah placeholder diisi.",
    };
  }
}

/**
 * Nomor HP untuk gateway: mayoritas gateway Indonesia menuntut format 62,
 * bukan 0 di depan.
 */
export function hpUntukGateway(noHp: string): string {
  const n = noHp.trim().replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (n.startsWith("62")) return n;
  if (n.startsWith("0")) return "62" + n.slice(1);
  return n;
}
