/**
 * Blok G3–G5 (ekspor laporan) dan E6 (peringatan SMTP di halaman admin).
 *
 * Semuanya lewat sesi login sungguhan ke Keycloak — bukan memanggil fungsi
 * langsung — karena yang diuji justru gerbang role pada route-nya.
 */
import { afterAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { bukaMentah, bukaSebagai, login } from "./login";
import { db } from "@/lib/db";
import { getConfig, setConfig } from "@/lib/tanki/config";

const SANDI = "Operator123!";
const RENTANG = "from=2026-07-01&to=2026-08-31";

/** Jumlah tiket yang seharusnya ikut terekspor pada rentang di atas. */
async function jumlahBaris() {
  const r = await db.$queryRawUnsafe<{ n: bigint }[]>(
    "SELECT COUNT(*) AS n FROM tiket WHERE created_at >= '2026-07-01 00:00:00' AND created_at < '2026-09-01 00:00:00'",
  );
  return Number(r[0].n);
}

describe("G3–G5 · ekspor laporan (Issue #1)", () => {
  it("G5 — operator tanpa role app-tanki mendapat 403 saat mencoba ekspor", async () => {
    const { jar } = await login("user-norole", SANDI);

    for (const format of ["csv", "xlsx"]) {
      const res = await bukaMentah(jar, `/dashboard/laporan/export?format=${format}&${RENTANG}`);
      expect(res.status, `format ${format}`).toBe(403);

      const body = (await res.json()) as { error?: string };
      expect(body.error).toMatch(/app-tanki/);
    }
  });

  it("G3 — CSV terunduh dan isinya terbuka benar", async () => {
    const { jar } = await login("operator", SANDI);
    const res = await bukaMentah(jar, `/dashboard/laporan/export?format=csv&${RENTANG}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename=".*\.csv"/);

    // BOM diperiksa dari byte mentah: Response.text() melakukan UTF-8 decode
    // yang MEMBUANG BOM, jadi memeriksanya dari string selalu lolos-palsu.
    const bytes = Buffer.from(await res.arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    const teks = bytes.toString("utf8");
    const baris = teks.replace(/^﻿/, "").trim().split(/\r?\n/);
    expect(baris.length).toBe((await jumlahBaris()) + 1); // + header

    // Header dan sebuah baris data yang memang ada di database.
    expect(baris[0]).toMatch(/No\. Tiket/i);
    expect(teks).toContain("TJ-UJI-0001");
    expect(teks).not.toContain("TJ-LUAR-0006"); // di luar rentang

    // Setiap baris punya jumlah kolom yang sama dengan header.
    const kolomHeader = baris[0].split(",").length;
    for (const b of baris.slice(1)) {
      // Pemisah di dalam tanda kutip tidak dihitung.
      const kolom = b.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).length;
      expect(kolom, `baris: ${b}`).toBe(kolomHeader);
    }
  });

  it("G3b — nilai yang diawali '=' dilindungi dari formula injection", async () => {
    const { jar } = await login("operator", SANDI);
    const teks = await (
      await bukaMentah(jar, `/dashboard/laporan/export?format=csv&${RENTANG}`)
    ).text();

    // Tidak boleh ada sel yang dimulai dengan karakter pemicu formula Excel.
    for (const sel of teks.split(/[\r\n,]/)) {
      const bersih = sel.replace(/^"/, "");
      expect(bersih.startsWith("=") || bersih.startsWith("@")).toBe(false);
    }
  });

  it("G4 — XLSX terunduh dan benar-benar bisa dibuka sebagai workbook Excel", async () => {
    const { jar } = await login("operator", SANDI);
    const res = await bukaMentah(jar, `/dashboard/laporan/export?format=xlsx&${RENTANG}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(
      /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
    );
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename=".*\.xlsx"/);

    const buf = Buffer.from(await res.arrayBuffer());

    // Berkas XLSX adalah arsip ZIP — dimulai dengan "PK".
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(buf.byteLength).toBeGreaterThan(1000);

    // Dibuka sungguhan dengan ExcelJS: kalau rusak, ini melempar.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const ws = wb.worksheets[0];
    expect(ws).toBeTruthy();
    expect(ws.rowCount).toBe((await jumlahBaris()) + 1); // + header

    const header = (ws.getRow(1).values as unknown[]).filter(Boolean).map(String);
    expect(header.join(" ")).toMatch(/No\. Tiket/i);

    // Isi selnya benar-benar data, bukan sel kosong.
    const semua = JSON.stringify(ws.getSheetValues());
    expect(semua).toContain("TJ-UJI-0001");
    expect(semua).not.toContain("TJ-LUAR-0006");
  });
});

describe("E6 · peringatan SMTP di halaman konfigurasi (Issue #7)", () => {
  it("peringatan kuning muncul selama smtp_host kosong, dan hilang setelah diisi", async () => {
    const { jar } = await login("operator", SANDI); // punya tanki-admin

    await setConfig({ smtp_host: "" }, "uji-integrasi");
    const kosong = await (await bukaSebagai(jar, "/dashboard/konfigurasi")).text();
    expect(kosong).toContain("SMTP belum dikonfigurasi.");
    expect(kosong).toMatch(/border-yellow-300|bg-yellow-50/);

    await setConfig({ smtp_host: "127.0.0.1" }, "uji-integrasi");
    const terisi = await (await bukaSebagai(jar, "/dashboard/konfigurasi")).text();
    expect(terisi).not.toContain("SMTP belum dikonfigurasi.");
  });
});

afterAll(async () => {
  // Kembalikan SMTP ke Mailpit supaya berkas uji lain tidak terpengaruh urutan.
  const cfg = await getConfig();
  if (!cfg.smtp_host) await setConfig({ smtp_host: "127.0.0.1" }, "uji-integrasi");
});
