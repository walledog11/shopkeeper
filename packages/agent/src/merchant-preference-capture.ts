import { randomUUID } from "node:crypto";
import {
  MERCHANT_PREFERENCE_GUIDANCE_MAX_CHARS,
  MERCHANT_PREFERENCE_PROPOSED_RATIONALE_MAX_CHARS,
  type MerchantPreferenceCategory,
  isObservedMerchantPreferenceProposalsEnabled,
  normalizeMerchantPreferenceGuidance,
  normalizeMerchantPreferenceRationale,
} from "@shopkeeper/db";
import { db } from "@shopkeeper/db";
import logger from "./logger.js";

export const MERCHANT_PREFERENCE_OBSERVATION_MIN_CHARS = 30;

const VOICE_REVISION_RE = /\b(warmer|friendlier|friendlier|tone|shorter|longer|more formal|less formal|softer|snappier|apolog|cheers|sign[- ]off)\b/i;
const JUDGMENT_RE = /\b(always|never|prefer|instead|rather|policy|offer|refund|credit|gift card|return|exchange|ship|shipping|discount|cap|limit|approve|deny)\b/i;

const CATEGORY_HINTS: Array<{ category: MerchantPreferenceCategory; pattern: RegExp }> = [
  { category: "compensation", pattern: /\b(refund|credit|gift card|discount|compensation|store credit)\b/i },
  { category: "returns", pattern: /\b(return|exchange|rma|restock)\b/i },
  { category: "shipping", pattern: /\b(ship|shipping|delivery|carrier|label)\b/i },
  { category: "policy", pattern: /\b(policy|student|warranty|restocking)\b/i },
];

function normalizeForDedupe(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function looksLikeVoiceRevision(guidance: string): boolean {
  return VOICE_REVISION_RE.test(guidance);
}

export function looksLikeReusableJudgment(guidance: string): boolean {
  const text = guidance.trim();
  if (text.length < MERCHANT_PREFERENCE_OBSERVATION_MIN_CHARS) return false;
  if (looksLikeVoiceRevision(text)) return false;
  return JUDGMENT_RE.test(text);
}

export function inferMerchantPreferenceCategory(guidance: string): MerchantPreferenceCategory {
  for (const hint of CATEGORY_HINTS) {
    if (hint.pattern.test(guidance)) return hint.category;
  }
  return "general";
}

export interface CaptureObservedMerchantPreferenceInput {
  organizationId: string;
  guidance: string;
  hasPendingQuestion: boolean;
  observedAt?: Date;
}

export function shouldCaptureObservedMerchantPreference(
  input: CaptureObservedMerchantPreferenceInput,
): boolean {
  if (!isObservedMerchantPreferenceProposalsEnabled()) return false;
  if (input.hasPendingQuestion) return false;
  return looksLikeReusableJudgment(input.guidance);
}

export async function captureObservedMerchantPreferenceProposal(
  input: CaptureObservedMerchantPreferenceInput,
): Promise<boolean> {
  if (!shouldCaptureObservedMerchantPreference(input)) return false;

  const guidance = normalizeMerchantPreferenceGuidance(input.guidance);
  const normalized = normalizeForDedupe(guidance);
  const existing = await db.merchantPreference.findMany({
    where: {
      organizationId: input.organizationId,
      status: { in: ["active", "proposed"] },
    },
    select: { guidance: true },
  });
  if (existing.some((row) => normalizeForDedupe(row.guidance) === normalized)) {
    return false;
  }

  const observedAt = input.observedAt ?? new Date();
  await db.merchantPreference.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      category: inferMerchantPreferenceCategory(guidance),
      guidance,
      source: "observed",
      status: "proposed",
      proposedRationale: normalizeMerchantPreferenceRationale(
        "Observed when the merchant revised a pending plan with reusable judgment.",
      ),
      observedAt,
    },
  });

  logger.info({
    orgId: input.organizationId,
    category: inferMerchantPreferenceCategory(guidance),
    guidanceLength: guidance.length,
  }, "[merchant-preference] observed proposal captured");

  return true;
}
