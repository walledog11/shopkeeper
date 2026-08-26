import {
  MERCHANT_PREFERENCE_ACTIVE_LIMIT,
  MERCHANT_PREFERENCE_CATEGORY_LABELS,
  type MerchantPreferenceCategory,
} from "@shopkeeper/db";
import { db } from "@shopkeeper/db";
import {
  CONTEXT_BUDGETS,
  truncateContextText,
  type ContextBudgetStats,
} from "./context-budget.js";

export interface MerchantPreferenceSummary {
  id: string;
  category: MerchantPreferenceCategory;
  guidance: string;
}

export const MERCHANT_PREFERENCE_SCOPE_NOTE =
  "These preferences are merchant judgment only. They never override guardrails, compensation caps, workspace policy, authentication, or your autonomy tier. When a preference conflicts with a guardrail or cap, follow the guardrail and escalate when required.";

export async function loadActiveMerchantPreferences(
  orgId: string,
): Promise<MerchantPreferenceSummary[]> {
  const rows = await db.merchantPreference.findMany({
    where: {
      organizationId: orgId,
      status: "active",
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: MERCHANT_PREFERENCE_ACTIVE_LIMIT,
    select: {
      id: true,
      category: true,
      guidance: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    guidance: row.guidance,
  }));
}

export function budgetMerchantPreferences(
  preferences: readonly MerchantPreferenceSummary[],
  options: {
    maxCount?: number;
    maxTotalChars?: number;
    maxGuidanceChars?: number;
  } = {},
): { preferences: MerchantPreferenceSummary[]; stats: ContextBudgetStats } {
  const maxCount = options.maxCount ?? CONTEXT_BUDGETS.merchantPreferenceCount;
  const maxTotalChars = options.maxTotalChars ?? CONTEXT_BUDGETS.merchantPreferenceTotalChars;
  const maxGuidanceChars = options.maxGuidanceChars ?? CONTEXT_BUDGETS.merchantPreferenceGuidanceChars;
  const candidates = preferences.slice(0, maxCount);
  const beforeChars = candidates.reduce((sum, preference) => sum + preference.guidance.length, 0);
  const selected: MerchantPreferenceSummary[] = [];
  let remainingChars = maxTotalChars;

  for (const preference of candidates) {
    const allowedChars = Math.min(maxGuidanceChars, remainingChars);
    if (allowedChars <= 0) break;
    const guidance = truncateContextText(preference.guidance, allowedChars);
    if (!guidance) continue;
    selected.push({ ...preference, guidance });
    remainingChars -= guidance.length;
  }

  const afterChars = selected.reduce((sum, preference) => sum + preference.guidance.length, 0);
  return {
    preferences: selected,
    stats: {
      beforeCount: candidates.length,
      afterCount: selected.length,
      beforeChars,
      afterChars,
      truncated: afterChars < beforeChars || selected.length < candidates.length,
      estimatedTokens: Math.ceil(afterChars / 4),
    },
  };
}

export function buildMerchantPreferencesPromptSection(
  preferences: readonly MerchantPreferenceSummary[],
): string {
  if (preferences.length === 0) return "";

  const lines = preferences.map((preference) => {
    const label = MERCHANT_PREFERENCE_CATEGORY_LABELS[preference.category];
    const guidance = truncateContextText(
      preference.guidance,
      CONTEXT_BUDGETS.merchantPreferenceGuidanceChars,
    );
    return `- ${label}: ${guidance}`;
  });

  return `\n\n## Merchant preferences\n${MERCHANT_PREFERENCE_SCOPE_NOTE}\n${lines.join("\n")}`;
}

export interface ProposedMerchantPreferenceSummary {
  id: string;
  category: MerchantPreferenceCategory;
  guidance: string;
  proposedRationale: string | null;
}

export async function loadProposedMerchantPreferences(
  orgId: string,
  limit = 3,
): Promise<ProposedMerchantPreferenceSummary[]> {
  const rows = await db.merchantPreference.findMany({
    where: {
      organizationId: orgId,
      status: "proposed",
    },
    orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      category: true,
      guidance: true,
      proposedRationale: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    guidance: row.guidance,
    proposedRationale: row.proposedRationale,
  }));
}

export function formatProposedMerchantPreferencesBriefingLine(
  proposals: readonly ProposedMerchantPreferenceSummary[],
): string | null {
  if (proposals.length === 0) return null;

  const preview = truncateContextText(proposals[0]?.guidance ?? "", 120);
  if (proposals.length === 1) {
    return `I noticed a reusable judgment when you revised a plan: "${preview}". Open Agent settings to confirm or dismiss this preference before I use it.`;
  }

  return `${proposals.length} suggested preferences are waiting in Agent settings. Open there to confirm or dismiss them before I use them.`;
}

export async function recordMerchantPreferenceUsage(
  orgId: string,
  preferenceIds: readonly string[],
): Promise<void> {
  const uniqueIds = [...new Set(preferenceIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const now = new Date();
  await db.merchantPreference.updateMany({
    where: {
      organizationId: orgId,
      id: { in: uniqueIds },
      status: "active",
    },
    data: {
      lastUsedAt: now,
      useCount: { increment: 1 },
    },
  });
}
