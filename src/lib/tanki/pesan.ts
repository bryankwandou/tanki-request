/**
 * Pengiriman WhatsApp/SMS lewat gateway HTTP (butir 3.3 laporan review).
 *
 * Keputusan bentuknya ada di pesan-policy.ts (murni & teruji); berkas ini yang
 * menyentuh jaringan dan database. Setiap pengiriman dicatat ke notifikasi_log
 * dengan `channel` WA/SMS, jadi log audit yang sudah dipakai email berlaku
 * sama untuk kanal ini — termasuk membedakan TERKIRIM dari DILEWATI.
 */
import { db } from "@/lib/db";
import { CONFIG_DEFAULTS, getConfig, renderTemplate } from "@/lib/tanki/config";
import { maskRecipient } from "@/lib/tanki/notify-policy";
import { bangunPayload, hpUntukGateway, resolveModePesan } from "@/lib/tanki/pesan-policy";
import { getSecretConfig } from "@/lib/tanki/config";

/** Batas waktu ke gateway. Tanpa ini, gateway yang menggantung ikut menahan
 *  pembuatan tiket — padahal pesan hanyalah pelengkap email. */
const TIMEOUT_MS = 8_000;

export type HasilPesan = {
  ok: boolean;
  dilewati?: boolean;
  error?: string;
};

export async function kirimPesan(args: {
  noHp: string | null | undefined;
  pesan: string;
  tiketId?: bigint | null;
}): Promise<HasilPesan> {
  if (!args.noHp) return { ok: false, dilewati: true, error: "Tidak ada nomor tujuan." };

  const cfg = await getConfig();
  const token = (await getSecretConfig("wa_api_token")) ?? "";
  const mode = resolveModePesan({
    aktif: cfg.wa_enabled === "true",
    url: cfg.wa_api_url,
    token,
  });

  if (mode === "mati") return { ok: false, dilewati: true, error: "Kanal WA/SMS dimatikan." };

  const tujuan = hpUntukGateway(args.noHp);

  if (mode === "lewati") {
    // Belum dikonfigurasi. Dicatat sebagai DILEWATI — bukan TERKIRIM — supaya
    // log audit tidak mengklaim pesan yang tidak pernah ada.
    await catat(args.tiketId, tujuan, "DILEWATI", "Gateway WA/SMS belum dikonfigurasi.");
    return { ok: false, dilewati: true };
  }

  const payload = bangunPayload(cfg.wa_payload_template || CONFIG_DEFAULTS.wa_payload_template, {
    no_hp: tujuan,
    pesan: args.pesan,
    token,
  });
  if (!payload.ok) {
    await catat(args.tiketId, tujuan, "GAGAL", payload.error);
    return { ok: false, error: payload.error };
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(cfg.wa_api_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: payload.body,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // Badan respons gateway sengaja TIDAK ikut disimpan mentah: sebagian
      // gateway memantulkan kembali token di dalamnya.
      const err = `Gateway menolak (HTTP ${res.status}).`;
      await catat(args.tiketId, tujuan, "GAGAL", err);
      return { ok: false, error: err };
    }

    await catat(args.tiketId, tujuan, "TERKIRIM", null);
    return { ok: true };
  } catch (e) {
    const err = e instanceof Error && e.name === "AbortError"
      ? `Gateway tidak menjawab dalam ${TIMEOUT_MS / 1000} detik.`
      : "Gagal menghubungi gateway WA/SMS.";
    await catat(args.tiketId, tujuan, "GAGAL", err);
    return { ok: false, error: err };
  }
}

async function catat(
  tiketId: bigint | null | undefined,
  tujuan: string,
  status: "TERKIRIM" | "GAGAL" | "DILEWATI",
  error: string | null,
) {
  try {
    await db.notifikasiLog.create({
      data: {
        tiketId: tiketId ?? null,
        channel: "WA",
        jenis: "TIKET",
        // Nomor disamarkan sama seperti email di kanal lain.
        tujuan: maskRecipient(tujuan),
        statusKirim: status,
        error,
      },
    });
  } catch {
    // Log gagal tidak boleh menjatuhkan pembuatan tiket.
  }
}

/** Isi pesan WA/SMS untuk tiket baru, dari template yang diatur admin. */
export async function pesanTiketBaru(noTiket: string): Promise<string> {
  const cfg = await getConfig();
  return renderTemplate(cfg.wa_tpl_tiket || CONFIG_DEFAULTS.wa_tpl_tiket, {
    no_tiket: noTiket,
  });
}
