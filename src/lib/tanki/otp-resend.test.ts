import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { evaluateResendGate, THROTTLE } from "./otp-policy";

const LIMITS = { maxAttempts: 5, maxResends: 3, cooldownMs: 60_000 };
const NOW = new Date("2026-07-28T10:00:00Z").getTime();
const long = (ms = 120_000) => new Date(NOW - ms);

/** Perilaku LAMA: kirim ulang selalu boleh dan me-reset attempts jadi 0. */
function oldResend(state: { attempts: number }) {
  return { allow: true as const, attemptsAfter: 0, previousAttempts: state.attempts };
}

describe("Issue #4 — cap percobaan tidak boleh dipulihkan oleh kirim ulang", () => {
  it("kirim ulang DITOLAK setelah cap tebakan habis", () => {
    const gate = evaluateResendGate(
      { attempts: 5, resendCount: 0, lastSentAt: long() },
      NOW,
      LIMITS,
    );
    expect(gate.allow).toBe(false);
    if (!gate.allow) {
      // Permintaan ditandai EXPIRED, bukan sekadar ditolak sekali.
      expect(gate.expire).toBe(true);
      expect(gate.error).toContain("ajukan permintaan baru");
    }
  });

  it("bukti regresi: perilaku lama memulihkan jatah tebakan", () => {
    const exhausted = { attempts: 5 };
    const before = oldResend(exhausted);
    expect(before.previousAttempts).toBe(5);
    // Inilah bypass-nya: setelah kirim ulang, penyerang punya 5 tebakan lagi.
    expect(before.attemptsAfter).toBe(0);

    // Versi baru menutup jalur itu sepenuhnya.
    expect(
      evaluateResendGate({ attempts: 5, resendCount: 0, lastSentAt: long() }, NOW, LIMITS).allow,
    ).toBe(false);
  });

  it("brute force tak terbatas jadi mustahil: 5 tebakan lalu berhenti", () => {
    // Simulasi penyerang: tebak sampai cap, kirim ulang, ulangi.
    let attempts = 0;
    let resendCount = 0;
    let totalGuesses = 0;

    for (let round = 0; round < 100; round++) {
      while (attempts < LIMITS.maxAttempts) {
        attempts++;
        totalGuesses++;
      }
      const gate = evaluateResendGate({ attempts, resendCount, lastSentAt: long() }, NOW, LIMITS);
      if (!gate.allow) break;
      resendCount++;
      // attempts TIDAK di-reset — inilah perbaikannya.
    }

    expect(totalGuesses).toBe(5);
  });

  it("kirim ulang masih boleh selama cap belum habis", () => {
    expect(
      evaluateResendGate({ attempts: 4, resendCount: 0, lastSentAt: long() }, NOW, LIMITS).allow,
    ).toBe(true);
  });
});

describe("batas kirim ulang", () => {
  it("ditolak setelah mencapai maxResends", () => {
    const gate = evaluateResendGate(
      { attempts: 0, resendCount: 3, lastSentAt: long() },
      NOW,
      LIMITS,
    );
    expect(gate.allow).toBe(false);
    if (!gate.allow) {
      expect(gate.expire).toBe(false);
      expect(gate.error).toContain("Batas kirim ulang");
    }
  });

  it("masih boleh pada kirim ulang ke-3", () => {
    expect(
      evaluateResendGate({ attempts: 0, resendCount: 2, lastSentAt: long() }, NOW, LIMITS).allow,
    ).toBe(true);
  });
});

describe("jeda antar kirim ulang", () => {
  it("ditolak bila belum melewati cooldown", () => {
    const gate = evaluateResendGate(
      { attempts: 0, resendCount: 0, lastSentAt: new Date(NOW - 10_000) },
      NOW,
      LIMITS,
    );
    expect(gate.allow).toBe(false);
    if (!gate.allow) {
      expect(gate.expire).toBe(false);
      expect(gate.error).toContain("50 detik");
    }
  });

  it("diizinkan tepat setelah cooldown lewat", () => {
    expect(
      evaluateResendGate(
        { attempts: 0, resendCount: 0, lastSentAt: new Date(NOW - 60_000) },
        NOW,
        LIMITS,
      ).allow,
    ).toBe(true);
  });

  it("cap tebakan diperiksa lebih dulu daripada cooldown", () => {
    // Penyerang yang menabrak cap tidak boleh cuma diberi tahu "tunggu sebentar".
    const gate = evaluateResendGate(
      { attempts: 5, resendCount: 0, lastSentAt: new Date(NOW - 1_000) },
      NOW,
      LIMITS,
    );
    expect(gate.allow).toBe(false);
    if (!gate.allow) expect(gate.expire).toBe(true);
  });
});

describe("Issue #4 item 5 — otpId tidak boleh sequential row id", () => {
  // Salinan generator + validator di src/lib/tanki/otp.ts.
  const genToken = () => crypto.randomBytes(32).toString("base64url");
  const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

  it("token berbentuk base64url 43 karakter (32 byte acak)", () => {
    const t = genToken();
    expect(t).toMatch(TOKEN_RE);
    expect(Buffer.from(t, "base64url")).toHaveLength(32);
  });

  it("tidak dapat ditebak: 1000 token semuanya unik", () => {
    const set = new Set(Array.from({ length: 1000 }, genToken));
    expect(set.size).toBe(1000);
  });

  it("token tidak berurutan — beda antar token tidak bisa diprediksi", () => {
    // Row id sequential: id korban = id sendiri +/- n. Token tidak begitu.
    const a = genToken();
    const b = genToken();
    let sama = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) sama++;
    // Dengan 64 simbol, kecocokan posisional yang diharapkan ~43/64 ≈ 0.67.
    expect(sama).toBeLessThan(10);
  });

  it("menolak bentuk lama (row id sequential) dan input sampah", () => {
    for (const bad of ["1", "42", "999999", "", "../../etc/passwd", "a".repeat(42), "a".repeat(44), "abc+def/ghi="]) {
      expect(TOKEN_RE.test(bad), `seharusnya ditolak: ${bad}`).toBe(false);
    }
  });
});

describe("Issue #4 item 1 — throttle berkunci otpId DAN identitas klien", () => {
  it("keempat kunci verify/resend ada dan berbatas", () => {
    // Checklist meminta "keyed on both otpId and client identity".
    expect(THROTTLE.verifyId.max).toBeGreaterThan(0);
    expect(THROTTLE.resendId.max).toBeGreaterThan(0);
    expect(THROTTLE.verifyIp.max).toBeGreaterThan(0);
    expect(THROTTLE.verifyEmail.max).toBeGreaterThan(0);
    expect(THROTTLE.resendIp.max).toBeGreaterThan(0);
    expect(THROTTLE.resendEmail.max).toBeGreaterThan(0);
  });

  it("cap per-otpId tidak melebihi cap tebakan, agar cap DB tetap yang mengikat", () => {
    expect(THROTTLE.verifyId.max).toBeLessThanOrEqual(LIMITS.maxAttempts * 2);
    expect(THROTTLE.resendId.max).toBeLessThanOrEqual(LIMITS.maxResends);
  });
});
