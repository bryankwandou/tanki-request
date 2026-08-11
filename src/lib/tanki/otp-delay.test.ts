import { describe, expect, it } from "vitest";
import { DELAY_MAKS_MS, delayGagalMs } from "./otp-delay";

describe("delay progresif setelah tebakan salah (butir 3.2)", () => {
  it("kesalahan PERTAMA tidak dihukum sama sekali", () => {
    // Warga yang salah ketik sekali tidak boleh merasa aplikasinya lambat.
    expect(delayGagalMs(0)).toBe(0);
  });

  it("naik berlipat pada tebakan berikutnya", () => {
    expect(delayGagalMs(1)).toBe(500);
    expect(delayGagalMs(2)).toBe(1000);
    expect(delayGagalMs(3)).toBe(2000);
    expect(delayGagalMs(4)).toBe(4000);
  });

  it("dibatasi supaya delay-nya sendiri tidak jadi celah DoS", () => {
    expect(delayGagalMs(5)).toBe(DELAY_MAKS_MS);
    expect(delayGagalMs(50)).toBe(DELAY_MAKS_MS);
    expect(delayGagalMs(1_000_000)).toBe(DELAY_MAKS_MS);
  });

  it("nilai rusak diperlakukan sebagai tanpa delay, bukan NaN", () => {
    // NaN akan diteruskan ke setTimeout dan diam-diam jadi 0 — lebih baik
    // eksplisit daripada bergantung pada perilaku itu.
    expect(delayGagalMs(NaN)).toBe(0);
    expect(delayGagalMs(-3)).toBe(0);
    expect(delayGagalMs(Infinity)).toBe(0);
  });

  it("kurvanya monoton naik — tidak ada tebakan yang lebih murah dari sebelumnya", () => {
    let sebelum = -1;
    for (let i = 0; i <= 12; i++) {
      const kini = delayGagalMs(i);
      expect(kini).toBeGreaterThanOrEqual(sebelum);
      sebelum = kini;
    }
  });

  it("total biaya menghabiskan satu jatah (5 tebakan) terasa, tapi tidak ekstrem", () => {
    const total = [0, 1, 2, 3, 4].reduce((a, n) => a + delayGagalMs(n), 0);
    expect(total).toBe(7500);
  });
});
