import { describe, expect, it } from "vitest";
import {
  codeMatchesHash,
  emailsMatch,
  evaluateVerificationAttempt,
  generateVerificationCode,
  hashVerificationCode,
  normalizeOrderName,
  VERIFICATION_MAX_ATTEMPTS,
  verificationExpiry,
  type VerificationRecord,
} from "./storefront-verification.js";

function record(overrides: Partial<VerificationRecord> = {}): VerificationRecord {
  return {
    codeHash: hashVerificationCode("123456"),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    verifiedAt: null,
    ...overrides,
  };
}

describe("verification codes", () => {
  it("generates six digits, keeping leading zeros", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateVerificationCode()).toMatch(/^\d{6}$/);
    }
  });

  it("never stores the code itself", () => {
    const hash = hashVerificationCode("123456");
    expect(hash).not.toContain("123456");
    expect(hash).toHaveLength(64);
  });

  it("accepts the code however the shopper punctuates it", () => {
    expect(codeMatchesHash("123 456", hashVerificationCode("123456"))).toBe(true);
    expect(codeMatchesHash("123-456", hashVerificationCode("123456"))).toBe(true);
    expect(codeMatchesHash("654321", hashVerificationCode("123456"))).toBe(false);
  });
});

describe("normalizeOrderName", () => {
  it("treats every way of writing an order number as one key", () => {
    for (const input of ["#1026", "1026", "  #1026 ", "# 1026"]) {
      expect(normalizeOrderName(input)).toBe("#1026");
    }
  });
});

describe("emailsMatch", () => {
  it("ignores case and surrounding space", () => {
    expect(emailsMatch(" Adam@Example.com ", "adam@example.com")).toBe(true);
  });

  it("never matches on an absent address", () => {
    expect(emailsMatch("", "adam@example.com")).toBe(false);
    expect(emailsMatch(null, null)).toBe(false);
    expect(emailsMatch("adam@example.com", null)).toBe(false);
  });
});

describe("evaluateVerificationAttempt", () => {
  it("verifies the right code", () => {
    expect(evaluateVerificationAttempt(record(), "123456")).toEqual({ status: "verified" });
  });

  it("counts down remaining attempts on a wrong code", () => {
    expect(evaluateVerificationAttempt(record({ attempts: 1 }), "000000")).toEqual({
      status: "wrong_code",
      attemptsRemaining: VERIFICATION_MAX_ATTEMPTS - 2,
    });
  });

  it("locks the pair once attempts are spent, even with the right code", () => {
    const spent = record({ attempts: VERIFICATION_MAX_ATTEMPTS });
    expect(evaluateVerificationAttempt(spent, "123456")).toEqual({ status: "locked" });
  });

  it("stays locked rather than reporting expiry, so a lock cannot be reset by waiting", () => {
    const lockedAndStale = record({
      attempts: VERIFICATION_MAX_ATTEMPTS,
      expiresAt: new Date(Date.now() - 1),
    });
    expect(evaluateVerificationAttempt(lockedAndStale, "123456")).toEqual({ status: "locked" });
  });

  it("refuses an expired code", () => {
    expect(
      evaluateVerificationAttempt(record({ expiresAt: new Date(Date.now() - 1) }), "123456"),
    ).toEqual({ status: "expired" });
  });

  it("reports no challenge rather than throwing when none was issued", () => {
    expect(evaluateVerificationAttempt(null, "123456")).toEqual({ status: "no_challenge" });
  });

  it("does not re-verify an already verified pair", () => {
    expect(evaluateVerificationAttempt(record({ verifiedAt: new Date() }), "000000")).toEqual({
      status: "already_verified",
    });
  });
});

describe("verificationExpiry", () => {
  it("is ten minutes out", () => {
    const now = new Date("2026-08-09T00:00:00.000Z");
    expect(verificationExpiry(now).toISOString()).toBe("2026-08-09T00:10:00.000Z");
  });
});
