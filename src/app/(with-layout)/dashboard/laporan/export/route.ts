/**
 * Ekspor Laporan — CSV & Excel (Issue #1, FR-47).
 *
 * Dibuat sebagai route handler, bukan server action, karena yang dikirim adalah
 * berkas biner/teks utuh dengan Content-Disposition.
 */
import { auth } from "@/lib/auth";
import { canAccessApp } from "@/lib/auth/roles";
import { KOLOM_EKSPOR, getBarisEkspor, type BarisEkspor } from "@/lib/tanki/laporan";
import { UTF8_BOM, guardFormula, toCsv } from "@/lib/tanki/export-format";
import { exportFilename, parseLaporanFilter } from "@/lib/tanki/laporan-filter";
import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();

  /**
   * Ekspor dibuka untuk semua role yang boleh masuk aplikasi, termasuk
   * tanki-operator-readonly.
   *
   * Issue #1 meminta keputusan ini dinyatakan eksplisit: peran readonly adalah
   * Direksi/monitoring, dan laporan periodik justru pekerjaan mereka. Berkasnya
   * pun tidak memuat apa pun yang tidak sudah terlihat di layar bagi peran yang
   * sama. Yang dijaga adalah gerbang aplikasinya, bukan tombol ekspornya.
   */
  if (!canAccessApp(session)) {
    return NextResponse.json(
      { error: "Butuh role app-tanki untuk mengunduh laporan." },
      { status: 403 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const filter = parseLaporanFilter(
    {
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      status: sp.get("status") ?? undefined,
      wil: sp.get("wil") ?? undefined,
      rayon: sp.get("rayon") ?? undefined,
    },
    new Date(),
  );

  const rows = await getBarisEkspor(filter);
  const format = sp.get("format") === "xlsx" ? "xlsx" : "csv";
  const filename = exportFilename(filter, format);

  if (format === "csv") {
    return new NextResponse(UTF8_BOM + toCsv(rows, KOLOM_EKSPOR), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const ws = wb.addWorksheet("Detail");
  ws.columns = KOLOM_EKSPOR.map((c) => ({
    header: c.label,
    key: String(c.key),
    width: c.key === "alamat" || c.key === "nama" ? 32 : 18,
  }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow(
      Object.fromEntries(
        KOLOM_EKSPOR.map((c) => [String(c.key), guardFormula(String(r[c.key as keyof BarisEkspor] ?? ""))]),
      ),
    );
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: KOLOM_EKSPOR.length } };

  // Lembar ringkas: parameter apa yang menghasilkan angka ini. Berkas laporan
  // gampang berpindah tangan lepas dari layar yang melahirkannya.
  const info = wb.addWorksheet("Filter");
  info.columns = [{ header: "Parameter", key: "k", width: 24 }, { header: "Nilai", key: "v", width: 32 }];
  info.getRow(1).font = { bold: true };
  info.addRows([
    { k: "Periode", v: `${filter.fromLabel} s.d. ${filter.toLabel} (inklusif, WITA)` },
    { k: "Status", v: filter.status ?? "semua" },
    { k: "Wilayah", v: filter.wil ?? "semua" },
    { k: "Rayon", v: filter.rayon ?? "semua" },
    { k: "Jumlah baris", v: rows.length },
  ]);

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
