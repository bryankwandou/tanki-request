import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TRACKING_LINK_TTL_MS,
  TrackingSecretMissingError,
  createTrackingToken,
  trackingUrl,
  verifyTrackingToken,
} from "./tracking-link";

const NOW = new Date("2026-07-15T02:00:00.000Z");
const asli = process.env.TRACKING_LINK_SECRET;
const asliAuth = process.env.AUTH_SECRET;

describe("tautan lacak bertanda tangan (Issue #6)", () => {
  beforeEach(() => {
    process.env.TRACKING_LINK_SECRET = "kunci-uji-yang-cukup-panjang-123456";
  });
  afterEach(() => {
    if (asli === undefined) delete process.env.TRACKING_LINK_SECRET;
    else process.env.TRACKING_LINK_SECRET = asli;
    if (asliAuth === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = asliAuth;
  });

  it("token yang sah membuka tiket yang benar", () => {
    const t = createTrackingToken("TJ-20260715-0001", NOW);
    expect(verifyTrackingToken(t, NOW)).toEqual({ ok: true, noTiket: "TJ-20260715-0001" });
  });

  it("nomor tiket tidak bisa diganti tanpa menandatangani ulang", () => {
    // Inti pertahanannya: kalau ini lolos, tautan jadi alat enumerasi.
    const t = createTrackingToken("TJ-20260715-0001", NOW);
    const [payload, sig] = t.split(".");
    const asli = Buffer.from(payload, "base64url").toString("utf8");
    const palsu = Buffer.from(asli.replace("0001", "0002"), "utf8").toString("base64url");
    expect(verifyTrackingToken(`${palsu}.${sig}`, NOW)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("tanda tangan yang diubah ditolak", () => {
    const t = createTrackingToken("TJ-20260715-0001", NOW);
    const [payload, sig] = t.split(".");
    const rusak = sig.slice(0, -2) + (sig.endsWith("aa") ? "bb" : "aa");
    expect(verifyTrackingToken(`${payload}.${rusak}`, NOW).ok).toBe(false);
  });

  it("token dari kunci lain ditolak", () => {
    const t = createTrackingToken("TJ-20260715-0001", NOW);
    process.env.TRACKING_LINK_SECRET = "kunci-yang-benar-benar-berbeda-987";
    expect(verifyTrackingToken(t, NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("kedaluwarsa setelah TTL lewat, dan dibedakan dari token palsu", () => {
    const t = createTrackingToken("TJ-20260715-0001", NOW);
    const sebelum = new Date(NOW.getTime() + TRACKING_LINK_TTL_MS - 1000);
    const sesudah = new Date(NOW.getTime() + TRACKING_LINK_TTL_MS + 1000);
    expect(verifyTrackingToken(t, sebelum).ok).toBe(true);
    expect(verifyTrackingToken(t, sesudah)).toEqual({ ok: false, reason: "expired" });
  });

  it("token berumur pendek bisa diminta secara eksplisit", () => {
    const t = createTrackingToken("TJ-1", NOW, 60_000);
    expect(verifyTrackingToken(t, new Date(NOW.getTime() + 61_000))).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("bentuk token yang ngawur ditolak tanpa melempar", () => {
    for (const jahat of ["", ".", "abc", "a.b", "....", "x".repeat(500)]) {
      expect(() => verifyTrackingToken(jahat, NOW)).not.toThrow();
      expect(verifyTrackingToken(jahat, NOW).ok).toBe(false);
    }
  });

  it("AUTH_SECRET dipakai bila TRACKING_LINK_SECRET tidak diset", () => {
    delete process.env.TRACKING_LINK_SECRET;
    process.env.AUTH_SECRET = "auth-secret-cadangan-yang-panjang-1";
    const t = createTrackingToken("TJ-1", NOW);
    expect(verifyTrackingToken(t, NOW)).toEqual({ ok: true, noTiket: "TJ-1" });
  });

  it("tanpa kunci sama sekali: menandatangani melempar, verifikasi menolak", () => {
    delete process.env.TRACKING_LINK_SECRET;
    delete process.env.AUTH_SECRET;
    expect(() => createTrackingToken("TJ-1", NOW)).toThrow(TrackingSecretMissingError);
    expect(verifyTrackingToken("a.b", NOW).ok).toBe(false);
  });

  it("URL email tersusun benar dan tokennya terbaca kembali", () => {
    const url = trackingUrl("TJ-20260715-0001", "http://localhost:3000/", NOW);
    expect(url.startsWith("http://localhost:3000/lacak?t=")).toBe(true);
    const token = decodeURIComponent(new URL(url).searchParams.get("t")!);
    expect(verifyTrackingToken(token, NOW)).toEqual({
      ok: true,
      noTiket: "TJ-20260715-0001",
    });
  });
});
