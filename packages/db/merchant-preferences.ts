// Shared contract for Milestone 5 merchant preference memory.

import { isRecord } from "./guards.js";

export const MERCHANT_PREFERENCE_GUIDANCE_MAX_CHARS = 500;
export const MERCHANT_PREFERENCE_PROPOSED_RATIONALE_MAX_CHARS = 300;
export const MERCHANT_PREFERENCE_ACTIVE_LIMIT = 10;

export const MERCHANT_PREFERENCE_CATEGORIES = [
  "compensation",
  "returns",
  "shipping",
  "policy",
  "general",
] as const;

export type MerchantPreferenceCategory = (typeof MERCHANT_PREFERENCE_CATEGORIES)[number];

export const MERCHANT_PREFERENCE_CATEGORY_LABELS: Record<MerchantPreferenceCategory, string> = {
  compensation: "Compensation",
  returns: "Returns",
  shipping: "Shipping",
  policy: "Policy",
  general: "General",
};

export function isMerchantPreferenceCategory(value: string): value is MerchantPreferenceCategory {
  return (MERCHANT_PREFERENCE_CATEGORIES as readonly string[]).includes(value);
}

export function normalizeMerchantPreferenceGuidance(value: string): string {
  return value.trim().slice(0, MERCHANT_PREFERENCE_GUIDANCE_MAX_CHARS);
}

export function normalizeMerchantPreferenceRationale(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.slice(0, MERCHANT_PREFERENCE_PROPOSED_RATIONALE_MAX_CHARS);
}

export interface MerchantPreferenceRecord {
  id: string;
  category: MerchantPreferenceCategory;
  guidance: string;
  source: "explicit" | "observed";
  status: "active" | "proposed" | "archived" | "rejected";
  confirmedAt: string | null;
  confirmedByClerkUserId: string | null;
  proposedRationale: string | null;
  observedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

export function serializeMerchantPreference(row: {
  id: string;
  category: string;
  guidance: string;
  source: string;
  status: string;
  confirmedAt: Date | null;
  confirmedByClerkUserId: string | null;
  proposedRationale: string | null;
  observedAt: Date | null;
  lastUsedAt: Date | null;
  useCount: number;
  createdAt: Date;
  updatedAt: Date;
}): MerchantPreferenceRecord {
  return {
    id: row.id,
    category: row.category as MerchantPreferenceCategory,
    guidance: row.guidance,
    source: row.source as MerchantPreferenceRecord["source"],
    status: row.status as MerchantPreferenceRecord["status"],
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    confirmedByClerkUserId: row.confirmedByClerkUserId,
    proposedRationale: row.proposedRationale,
    observedAt: row.observedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    useCount: row.useCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function isObservedMerchantPreferenceProposalsEnabled(): boolean {
  return process.env.MERCHANT_PREFERENCE_OBSERVED_PROPOSALS === "true";
}

export function parseMerchantPreferenceCreateBody(value: unknown): {
  category: MerchantPreferenceCategory;
  guidance: string;
} {
  if (!isRecord(value)) {
    throw new Error("Request body must be a JSON object");
  }

  const category = typeof value.category === "string" ? value.category.trim() : "";
  if (!isMerchantPreferenceCategory(category)) {
    throw new Error("Invalid category");
  }

  const guidance = normalizeMerchantPreferenceGuidance(
    typeof value.guidance === "string" ? value.guidance : "",
  );
  if (!guidance) {
    throw new Error("Guidance is required");
  }

  return { category, guidance };
}

export function parseMerchantPreferencePatchBody(value: unknown): {
  action: "archive" | "confirm" | "reject";
} {
  if (!isRecord(value)) {
    throw new Error("Request body must be a JSON object");
  }

  const action = typeof value.action === "string" ? value.action.trim() : "";
  if (action !== "archive" && action !== "confirm" && action !== "reject") {
    throw new Error("Invalid action");
  }

  return { action };
}
