import { describe, expect, it } from "vitest";
import { bangunPayload, hpUntukGateway, resolveModePesan } from "./pesan-policy";

describe("resolveModePesan", () => {
  it("dimatikan admin → tidak melakukan apa pun", () => {
    expect(resolveModePesan({ aktif: false, url: "https://gw", token: "t" })).toBe("mati");
  });

  it("aktif tapi URL kosong → DILEWATI, bukan mengaku terkirim", () => {
    // Log audit tidak boleh mengklaim pesan yang tidak pernah ada.
    expect(resolveModePesan({ aktif: true, url: "", token: "t" })).toBe("lewati");
    expect(resolveModePesan({ aktif: true, url: "   ", token: "t" })).toBe("lewati");
  });

  it("aktif dan URL terisi → kirim", () => {
    expect(resolveModePesan({ aktif: true, url: "https://gw", token: "" })).toBe("kirim");
  });
});

describe("hpUntukGateway — mayoritas gateway Indonesia menuntut awalan 62", () => {
  it("mengubah 0812… menjadi 62812…", () => {
    expect(hpUntukGateway("081234567890")).toBe("6281234567890");
  });

  it("nomor yang sudah 62 atau +62 dibiarkan konsisten", () => {
    expect(hpUntukGateway("6281234567890")).toBe("6281234567890");
    expect(hpUntukGateway("+62 812-3456-7890")).toBe("6281234567890");
  });
});

describe("bangunPayload — penyisipan aman ke JSON", () => {
  it("mengisi placeholder pada template bawaan", () => {
    const r = bangunPayload('{"target":"{{no_hp}}","message":"{{pesan}}"}', {
      no_hp: "6281234567890",
      pesan: "Tiket TJ-20260807-00R7",
    });
    expect(r.ok).toBe(true);
    expect(r.ok && JSON.parse(r.body)).toEqual({
      target: "6281234567890",
      message: "Tiket TJ-20260807-00R7",
    });
  });

  it("tanda kutip di dalam nilai TIDAK merusak JSON", () => {
    // Penempelan string mentah akan menghasilkan JSON rusak di sini.
    const r = bangunPayload('{"message":"{{pesan}}"}', {
      pesan: 'Keluhan: "air tidak mengalir"',
    });
    expect(r.ok).toBe(true);
    expect(r.ok && JSON.parse(r.body).message).toBe('Keluhan: "air tidak mengalir"');
  });

  it("nilai tidak bisa menyuntikkan field tambahan ke permintaan gateway", () => {
    const r = bangunPayload('{"message":"{{pesan}}"}', {
      pesan: '","admin":true,"x":"',
    });
    expect(r.ok).toBe(true);
    const parsed = r.ok ? JSON.parse(r.body) : {};
    expect(Object.keys(parsed)).toEqual(["message"]);
    expect(parsed.admin).toBeUndefined();
  });

  it("newline dan tab ikut ter-escape", () => {
    const r = bangunPayload('{"message":"{{pesan}}"}', { pesan: "baris1\nbaris2" });
    expect(r.ok).toBe(true);
    expect(r.ok && JSON.parse(r.body).message).toBe("baris1\nbaris2");
  });

  it("template yang bukan JSON sah ditolak dengan pesan jelas, bukan dikirim", () => {
    const r = bangunPayload("target={{no_hp}}", { no_hp: "62812" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/JSON/i);
  });

  it("placeholder yang tidak dikenal dibiarkan apa adanya", () => {
    const r = bangunPayload('{"a":"{{tidakAda}}"}', { pesan: "x" });
    expect(r.ok).toBe(true);
    expect(r.ok && JSON.parse(r.body).a).toBe("{{tidakAda}}");
  });
});
