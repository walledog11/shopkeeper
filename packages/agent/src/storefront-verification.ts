// Emailed-code identity verification for storefront chat (M1.5).
//
// The whole design rests on one invariant: a code only ever travels to the
// address already on the order. The address the shopper types is a *guess* to be
// compared, never a destination. Someone who types a stranger's order number
// with their own address gets a code delivered to the real owner's inbox and
// learns nothing — not even whether the order exists.
//
// That is also why issueVerification returns the same shape whether or not the
// order matched. The caller must not branch on it in a way the shopper can see.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const VERIFICATION_CODE_LENGTH = 6;
export const VERIFICATION_TTL_MS = 10 * 60 * 1000;
export const VERIFICATION_MAX_ATTEMPTS = 5;
// Far tighter than the message budget, and deliberately per session: without its
// own ceiling the widget is a way to mail-bomb whoever's address is on an order.
export const VERIFICATION_MAX_SENDS_PER_SESSION = 5;

export function generateVerificationCode(): string {
  // randomInt is CSPRNG-backed; padded so codes keep a constant 6 digits and a
  // leading zero is never dropped into a 5-digit code.
  return String(randomInt(0, 10 ** VERIFICATION_CODE_LENGTH)).padStart(
    VERIFICATION_CODE_LENGTH,
    "0",
  );
}

export function hashVerificationCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}

export function normalizeCode(code: string): string {
  return code.replace(/\D/g, "");
}

// `#1026`, `1026` and ` #1026 ` are the same order to a shopper, so they must be
// the same key here — otherwise a re-request writes a second challenge row and
// the unique constraint stops meaning what it says.
export function normalizeOrderName(orderName: string): string {
  const trimmed = orderName.trim();
  const digitsAndLetters = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  return `#${digitsAndLetters.trim()}`;
}

export function emailsMatch(supplied: string | null | undefined, onOrder: string | null | undefined): boolean {
  const a = (supplied ?? "").trim().toLowerCase();
  const b = (onOrder ?? "").trim().toLowerCase();
  return a.length > 0 && a === b;
}

// Constant-time compare so a wrong code cannot be narrowed digit by digit from
// response timing. Length is checked first because timingSafeEqual throws on a
// length mismatch, and code length is not a secret.
export function codeMatchesHash(supplied: string, storedHash: string): boolean {
  const suppliedHash = hashVerificationCode(supplied);
  if (suppliedHash.length !== storedHash.length) return false;
  return timingSafeEqual(Buffer.from(suppliedHash), Buffer.from(storedHash));
}

export interface VerificationRecord {
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  verifiedAt: Date | null;
}

export type VerificationOutcome =
  | { status: "verified" }
  | { status: "already_verified" }
  | { status: "expired" }
  | { status: "locked" }
  | { status: "wrong_code"; attemptsRemaining: number }
  | { status: "no_challenge" };

// Pure decision function: given the stored row and what the shopper typed, say
// what happens. Kept free of I/O so every branch is testable without a database,
// and so the caller cannot accidentally skip the attempt ceiling.
export function evaluateVerificationAttempt(
  record: VerificationRecord | null,
  suppliedCode: string,
  now: Date = new Date(),
): VerificationOutcome {
  if (!record) return { status: "no_challenge" };
  if (record.verifiedAt) return { status: "already_verified" };
  // Attempts are checked before expiry so a locked pair stays locked rather than
  // reporting itself as merely stale, which would invite a fresh code request.
  if (record.attempts >= VERIFICATION_MAX_ATTEMPTS) return { status: "locked" };
  if (record.expiresAt.getTime() <= now.getTime()) return { status: "expired" };
  if (!codeMatchesHash(suppliedCode, record.codeHash)) {
    return { status: "wrong_code", attemptsRemaining: VERIFICATION_MAX_ATTEMPTS - (record.attempts + 1) };
  }
  return { status: "verified" };
}

export function verificationExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + VERIFICATION_TTL_MS);
}

export function buildVerificationEmail(code: string, shopName: string, orderName: string): {
  subject: string;
  text: string;
} {
  return {
    subject: `Your ${shopName} verification code`,
    text: [
      `Your code is ${code}.`,
      "",
      `Someone asked about order ${orderName} in the chat on our website and needs to confirm they're you.`,
      "It expires in 10 minutes and can only be used once.",
      "",
      "If that wasn't you, you can ignore this — nobody sees your order details without this code.",
    ].join("\n"),
  };
}
