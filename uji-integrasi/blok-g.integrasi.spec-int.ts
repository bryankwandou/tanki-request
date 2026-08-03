/**
 * Blok G1–G2 — Issue #1, agregasi laporan terhadap MySQL berisi data.
 *
 * Angka dari getLaporan() diadu dengan hitungan manual lewat SQL mentah, bukan
 * dengan ekspektasi yang ditulis tangan — supaya yang diuji benar-benar
 * kecocokan groupBy dengan isi tabel.
 */
import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { getLaporan } from "@/lib/tanki/laporan";
import { parseLaporanFilter } from "@/lib/tanki/laporan-filter";

/** Rentang yang memuat TJ-UJI-0001..0005 tapi TIDAK memuat TJ-LUAR-0006. */
const FROM = "2026-07-01";
const TO = "2026-08-31";

const filter = () => parseLaporanFilter({ from: FROM, to: TO }, new Date());

async function hitungManual(sql: string, ...params: unknown[]) {
  return db.$queryRawUnsafe<{ k: string | null; n: bigint }[]>(sql, ...params);
}

describe("G · agregasi laporan (Issue #1)", () => {
  it("G1 — total & groupBy status cocok dengan hitungan manual di rentang tanggal", async () => {
    const f = filter();
    const hasil = await getLaporan(f);

    const [{ n: totalManual }] = await hitungManual(
      "SELECT NULL AS k, COUNT(*) AS n FROM tiket WHERE created_at >= ? AND created_at < ?",
      f.start,
      f.endExclusive,
    );
    expect(hasil.total).toBe(Number(totalManual));

    // Rentang benar-benar memotong: TJ-LUAR-0006 (1 Juni) harus di luar.
    const [{ n: semua }] = await hitungManual("SELECT NULL AS k, COUNT(*) AS n FROM tiket");
    expect(Number(semua)).toBeGreaterThan(hasil.total);

    const perStatusManual = await hitungManual(
      "SELECT status AS k, COUNT(*) AS n FROM tiket WHERE created_at >= ? AND created_at < ? GROUP BY status",
      f.start,
      f.endExclusive,
    );
    const petaManual = Object.fromEntries(perStatusManual.map((r) => [r.k, Number(r.n)]));

    for (const baris of hasil.perStatus) {
      expect(baris.total, `status ${baris.status}`).toBe(petaManual[baris.status] ?? 0);
    }
    // Jumlah per status harus menutup total, tanpa sisa.
    expect(hasil.perStatus.reduce((a, b) => a + b.total, 0)).toBe(hasil.total);
  });

  it("G1b — breakdown wilayah & rayon cocok dengan hitungan manual", async () => {
    const f = filter();
    const hasil = await getLaporan(f);

    const wilManual = await hitungManual(
      "SELECT wil AS k, COUNT(*) AS n FROM tiket WHERE created_at >= ? AND created_at < ? GROUP BY wil",
      f.start,
      f.endExclusive,
    );
    const petaWil = Object.fromEntries(wilManual.map((r) => [r.k ?? "(tanpa data)", Number(r.n)]));
    expect(Object.fromEntries(hasil.perWilayah.map((b) => [b.key, b.total]))).toEqual(petaWil);

    const rayonManual = await hitungManual(
      "SELECT koderayon AS k, COUNT(*) AS n FROM tiket WHERE created_at >= ? AND created_at < ? GROUP BY koderayon",
      f.start,
      f.endExclusive,
    );
    const petaRayon = Object.fromEntries(rayonManual.map((r) => [r.k ?? "(tanpa data)", Number(r.n)]));
    expect(Object.fromEntries(hasil.perRayon.map((b) => [b.key, b.total]))).toEqual(petaRayon);
  });

  it("G2 — breakdown memakai kolom snapshot: master pelanggan berubah, laporan historis TIDAK ikut berubah", async () => {
    const f = filter();
    const sebelum = await getLaporan(f);

    // Pindahkan pelanggan TJ-UJI-0001 ke wilayah lain di MASTER.
    // Kalau agregasi join hidup ke `pelanggan`, angka wilayah akan bergeser.
    const asli = await db.$queryRawUnsafe<{ wil: string; koderayon: string }[]>(
      "SELECT wil, koderayon FROM pelanggan WHERE nosamb = '197600001'",
    );
    expect(asli.length).toBe(1);

    await db.$executeRawUnsafe(
      "UPDATE pelanggan SET wil = '09', koderayon = '099999' WHERE nosamb = '197600001'",
    );
    try {
      const sesudah = await getLaporan(f);

      expect(sesudah.perWilayah).toEqual(sebelum.perWilayah);
      expect(sesudah.perRayon).toEqual(sebelum.perRayon);
      expect(sesudah.total).toBe(sebelum.total);

      // Dan wilayah baru itu memang tidak muncul di laporan.
      expect(sesudah.perWilayah.map((b) => b.key)).not.toContain("09");

      // Sementara barisnya di tiket tetap memegang snapshot lamanya.
      const snap = await db.$queryRawUnsafe<{ wil: string }[]>(
        "SELECT wil FROM tiket WHERE no_tiket = 'TJ-UJI-0001'",
      );
      expect(snap[0].wil).toBe(asli[0].wil);
    } finally {
      await db.$executeRawUnsafe(
        "UPDATE pelanggan SET wil = ?, koderayon = ? WHERE nosamb = '197600001'",
        asli[0].wil,
        asli[0].koderayon,
      );
    }
  });
});

afterAll(async () => {
  // Pastikan master kembali utuh walau ada kasus yang gagal di tengah.
  const cek = await db.$queryRawUnsafe<{ wil: string }[]>(
    "SELECT wil FROM pelanggan WHERE nosamb = '197600001'",
  );
  if (cek[0]?.wil === "09") {
    await db.$executeRawUnsafe(
      "UPDATE pelanggan SET wil = '04', koderayon = '040402' WHERE nosamb = '197600001'",
    );
  }
});
