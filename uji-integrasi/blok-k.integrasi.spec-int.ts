/**
 * Blok K — kanal WhatsApp/SMS (butir 3.3 laporan review).
 *
 * Diadu ke gateway HTTP SUNGGUHAN yang dijalankan di dalam uji ini, bukan mock:
 * yang perlu dibuktikan justru bahwa permintaan yang keluar benar-benar
 * berbentuk seperti yang diharapkan gateway, dan bahwa gateway yang mati atau
 * menggantung tidak ikut menjatuhkan pembuatan tiket.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { execFileSync } from "node:child_process";

import { db } from "@/lib/db";
import { setConfig } from "@/lib/tanki/config";
import { createTiket } from "@/lib/tanki/tiket";

const flushRedis = () =>
  execFileSync("docker", ["exec", "tanki-redis", "redis-cli", "FLUSHALL"]).toString().trim();

type Diterima = { body: string; auth: string | undefined };
let diterima: Diterima[] = [];

let server: Server;
let port = 0;
/** Perilaku gateway palsu untuk kasus uji berjalan. */
let perilaku: "ok" | "gagal" | "gantung" = "ok";

let pool: string[] = [];
let idx = 0;
const berikutnya = () => pool[idx++];
const dibuat: string[] = [];

async function ajukan(nosamb: string) {
  const r = await createTiket({
    noPelanggan: nosamb,
    noHp: "081234567899",
    email: `uji-k-${nosamb}@example.com`,
    keluhan: "uji integrasi blok K",
  });
  if (r.ok) dibuat.push(r.noTiket);
  return r;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      diterima.push({ body, auth: req.headers.authorization });
      if (perilaku === "gantung") return; // sengaja tidak pernah menjawab
      if (perilaku === "gagal") {
        res.writeHead(502).end("bad gateway");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end('{"status":"ok"}');
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as { port: number }).port;

  const rows = await db.$queryRawUnsafe<{ nosamb: string }[]>(
    `SELECT p.nosamb FROM pelanggan p
       LEFT JOIN tiket t ON t.no_pelanggan = p.nosamb
      WHERE t.id IS NULL
      LIMIT 40`,
  );
  pool = rows.map((r) => r.nosamb);
  expect(pool.length).toBeGreaterThan(8);
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  if (dibuat.length) await db.tiket.deleteMany({ where: { noTiket: { in: dibuat } } });
  await setConfig({ wa_enabled: "false", wa_api_url: "" });
});

beforeEach(async () => {
  flushRedis();
  diterima = [];
  perilaku = "ok";
  await setConfig({ submit_cooldown_hours: "24", verifikasi_hp_wajib: "false" });
});

afterEach(async () => {
  await setConfig({ wa_enabled: "false", wa_api_url: "" });
});

describe("K1 · pengiriman ke gateway", () => {
  it("tiket baru memicu POST berisi nomor 62… dan nomor tiketnya", async () => {
    await setConfig({ wa_enabled: "true", wa_api_url: `http://127.0.0.1:${port}/send` });

    const r = await ajukan(berikutnya());
    expect(r.ok, !r.ok ? r.error : "").toBe(true);

    expect(diterima).toHaveLength(1);
    const payload = JSON.parse(diterima[0].body);
    // Mayoritas gateway Indonesia menolak format "08…".
    expect(payload.target).toBe("6281234567899");
    expect(payload.message).toContain(r.ok ? r.noTiket : "");
  });

  it("pengiriman berhasil tercatat TERKIRIM di notifikasi_log kanal WA", async () => {
    await setConfig({ wa_enabled: "true", wa_api_url: `http://127.0.0.1:${port}/send` });
    const r = await ajukan(berikutnya());
    expect(r.ok).toBe(true);

    const log = await db.notifikasiLog.findFirst({
      where: { channel: "WA" },
      orderBy: { id: "desc" },
    });
    expect(log?.statusKirim).toBe("TERKIRIM");
    // Nomor tujuan disamarkan, sama seperti email.
    expect(log?.tujuan).not.toBe("6281234567899");
  });
});

describe("K2 · gateway bermasalah tidak boleh menjatuhkan permintaan warga", () => {
  it("gateway menolak (HTTP 502): tiket TETAP terbuat, kegagalan tercatat", async () => {
    await setConfig({ wa_enabled: "true", wa_api_url: `http://127.0.0.1:${port}/send` });
    perilaku = "gagal";

    const r = await ajukan(berikutnya());
    expect(r.ok, !r.ok ? r.error : "").toBe(true);

    const log = await db.notifikasiLog.findFirst({
      where: { channel: "WA" },
      orderBy: { id: "desc" },
    });
    expect(log?.statusKirim).toBe("GAGAL");
  });

  it("URL gateway tidak ada sama sekali: tiket tetap terbuat", async () => {
    // Port yang tidak ada yang mendengarkan — connection refused.
    await setConfig({ wa_enabled: "true", wa_api_url: "http://127.0.0.1:1/send" });
    const r = await ajukan(berikutnya());
    expect(r.ok, !r.ok ? r.error : "").toBe(true);
  });

  it("gateway menggantung: tiket tetap terbuat setelah timeout, tidak menunggu selamanya", async () => {
    await setConfig({ wa_enabled: "true", wa_api_url: `http://127.0.0.1:${port}/send` });
    perilaku = "gantung";

    const t = Date.now();
    const r = await ajukan(berikutnya());
    const durasi = Date.now() - t;

    expect(r.ok, !r.ok ? r.error : "").toBe(true);
    // Timeout 8 detik; kalau tidak ada timeout, uji ini akan habis waktunya.
    expect(durasi).toBeLessThan(20_000);

    const log = await db.notifikasiLog.findFirst({
      where: { channel: "WA" },
      orderBy: { id: "desc" },
    });
    expect(log?.statusKirim).toBe("GAGAL");
    expect(log?.error).toMatch(/tidak menjawab/i);
  }, 60_000);
});

describe("K3 · belum dikonfigurasi", () => {
  it("aktif tapi URL kosong dicatat DILEWATI, bukan TERKIRIM", async () => {
    // Log audit tidak boleh mengklaim pesan yang tidak pernah ada.
    await setConfig({ wa_enabled: "true", wa_api_url: "" });
    const r = await ajukan(berikutnya());
    expect(r.ok).toBe(true);

    const log = await db.notifikasiLog.findFirst({
      where: { channel: "WA" },
      orderBy: { id: "desc" },
    });
    expect(log?.statusKirim).toBe("DILEWATI");
  });

  it("dimatikan: tidak ada permintaan keluar dan tidak ada baris log baru", async () => {
    await setConfig({ wa_enabled: "false", wa_api_url: `http://127.0.0.1:${port}/send` });
    const sebelum = await db.notifikasiLog.count({ where: { channel: "WA" } });

    const r = await ajukan(berikutnya());
    expect(r.ok).toBe(true);

    expect(diterima).toHaveLength(0);
    expect(await db.notifikasiLog.count({ where: { channel: "WA" } })).toBe(sebelum);
  });
});
