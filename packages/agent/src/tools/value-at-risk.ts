import type { OrgSettings } from "../types.js";
import { resolveAgentSettings } from "../settings.js";

/**
 * The blast-radius guard shared by every shop-management write.
 *
 * It bounds how far a written instruction can be misread, not how much money
 * the merchant may choose to forgo: breadth (how many variants a sentence
 * resolved to), depth (a 20% cut written as 80%), and expiry (a sale nobody
 * ends). A merchant lowering a price knows what it costs them, so there is no
 * bound on the revenue a markdown gives up — that judgement is theirs and the
 * guard does not price it.
 *
 * Every violation is a code. The message is display, and no caller branches on
 * it. Each message names a way out that exists: the model reads this refusal,
 * and a bound stated without a remedy is one it will invent a remedy for. A
 * remedy that only splits the same write across two calls is not one.
 */

export type ValueAtRiskCode =
  | "no_variants"
  | "too_many_variants"
  | "discount_too_deep"
  | "ttl_missing"
  | "ttl_too_long";

export interface ValueAtRiskViolation {
  code: ValueAtRiskCode;
  /** Display only. Never matched on. */
  message: string;
  /** The bound that was crossed, in the unit the code implies. */
  limit: number;
  /** What the request asked for, in the same unit. */
  requested: number;
}

/** One variant a write would touch, named so the merchant can see what it hits. */
export interface ValueAtRiskVariant {
  variantId: string;
  title?: string;
}

export interface ValueAtRiskRequest {
  /**
   * The variants this write touches, enumerated. There is no wildcard form: a
   * catalog-wide write is expressed as every variant and is refused by the
   * count bound, so "all products" cannot be smuggled past the guard as an
   * absent field.
   */
  variants: readonly ValueAtRiskVariant[];
  /** 0–100. Zero for a write that changes no price. */
  discountPercent: number;
  /** How long the change stays live. Absent is a violation, not a default. */
  ttlHours: number | null;
}

export interface ValueAtRiskPreview {
  variantCount: number;
  /** Truncated for display; `variantCount` is the true figure. */
  sampleTitles: readonly string[];
  discountPercent: number;
  ttlHours: number | null;
  expiresAt: Date | null;
}

export interface ValueAtRiskAssessment {
  ok: boolean;
  violations: readonly ValueAtRiskViolation[];
  preview: ValueAtRiskPreview;
}

export interface ValueAtRiskLimits {
  maxVariants: number;
  maxDiscountPercent: number;
  maxTtlHours: number;
}

/**
 * Defaults sized for a solo merchant running a weekend sale, not for a
 * catalog-wide repricing. They are deliberately low: a merchant who wants more
 * raises the setting deliberately, which is a decision with an owner, rather
 * than discovering the ceiling after the fact.
 */
export const VALUE_AT_RISK_DEFAULTS: ValueAtRiskLimits = {
  maxVariants: 50,
  maxDiscountPercent: 40,
  maxTtlHours: 168,
};

const SAMPLE_TITLE_LIMIT = 5;

/**
 * A merchant may raise these, but not out of their range: a discount ceiling
 * above 100% is not a looser bound, it is a disabled one, and there is no
 * setting that disables a bound here.
 */
export function resolveValueAtRiskLimits(settings?: OrgSettings): ValueAtRiskLimits {
  const s = resolveAgentSettings(settings);
  return {
    maxVariants: Math.max(1, Math.floor(
      s.maxPromotionVariants ?? VALUE_AT_RISK_DEFAULTS.maxVariants,
    )),
    maxDiscountPercent: clampPercent(
      s.maxPromotionDiscountPercent ?? VALUE_AT_RISK_DEFAULTS.maxDiscountPercent,
    ),
    maxTtlHours: Math.max(1, Math.floor(
      s.maxPromotionTtlHours ?? VALUE_AT_RISK_DEFAULTS.maxTtlHours,
    )),
  };
}

export function buildValueAtRiskPreview(
  request: ValueAtRiskRequest,
  now: Date = new Date(),
): ValueAtRiskPreview {
  return {
    variantCount: request.variants.length,
    sampleTitles: request.variants
      .slice(0, SAMPLE_TITLE_LIMIT)
      .map((variant) => variant.title ?? variant.variantId),
    discountPercent: clampPercent(request.discountPercent),
    ttlHours: request.ttlHours,
    expiresAt: request.ttlHours === null
      ? null
      : new Date(now.getTime() + request.ttlHours * 3_600_000),
  };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Assess a write before it happens. Returns every violation rather than the
 * first, so the merchant is told everything wrong with the request in one pass
 * instead of discovering the next bound after fixing this one.
 */
export function assessValueAtRisk(
  request: ValueAtRiskRequest,
  settings?: OrgSettings,
  now: Date = new Date(),
): ValueAtRiskAssessment {
  const limits = resolveValueAtRiskLimits(settings);
  const preview = buildValueAtRiskPreview(request, now);
  const violations: ValueAtRiskViolation[] = [];

  if (request.variants.length === 0) {
    violations.push({
      code: "no_variants",
      message: "No variants were named, so there is nothing to preview or bound. "
        + "Name the variants to change.",
      limit: 1,
      requested: 0,
    });
  }

  if (request.variants.length > limits.maxVariants) {
    violations.push({
      code: "too_many_variants",
      message:
        `This would change ${request.variants.length} variants, over the limit of `
        + `${limits.maxVariants}. Name fewer variants.`,
      limit: limits.maxVariants,
      requested: request.variants.length,
    });
  }

  if (preview.discountPercent > limits.maxDiscountPercent) {
    violations.push({
      code: "discount_too_deep",
      message:
        `A ${preview.discountPercent}% discount is deeper than the ${limits.maxDiscountPercent}% `
        + "limit. Lower the discount.",
      limit: limits.maxDiscountPercent,
      requested: preview.discountPercent,
    });
  }

  if (request.ttlHours === null) {
    violations.push({
      code: "ttl_missing",
      message: "Every promotion has to expire. Set how long this should run.",
      limit: limits.maxTtlHours,
      requested: 0,
    });
  } else if (request.ttlHours <= 0) {
    violations.push({
      code: "ttl_missing",
      message: "A promotion that expires immediately or in the past cannot run. "
        + "Set a positive number of hours.",
      limit: limits.maxTtlHours,
      requested: request.ttlHours,
    });
  } else if (request.ttlHours > limits.maxTtlHours) {
    violations.push({
      code: "ttl_too_long",
      message:
        `Running for ${request.ttlHours} hours is longer than the `
        + `${limits.maxTtlHours}-hour limit. Shorten it to ${limits.maxTtlHours} hours or less.`,
      limit: limits.maxTtlHours,
      requested: request.ttlHours,
    });
  }

  return { ok: violations.length === 0, violations, preview };
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * The refusal a tool returns for a blocked write. Composed from the preview's
 * fields and the violation messages, so length is controlled by choosing what
 * to render rather than by truncating a sentence.
 */
export function formatValueAtRiskRefusal(assessment: ValueAtRiskAssessment): string {
  const reasons = assessment.violations.map((violation) => `- ${violation.message}`);
  return [
    "Error: this change is outside the store's safety limits, so nothing was applied.",
    ...reasons,
  ].join("\n");
}

/** The preview a merchant approves, rendered from fields. */
export function formatValueAtRiskPreview(preview: ValueAtRiskPreview): string {
  const lines = [
    `Variants: ${preview.variantCount}`,
    `Discount: ${preview.discountPercent}%`,
  ];
  if (preview.expiresAt) {
    lines.push(`Expires: ${preview.expiresAt.toISOString()}`);
  }
  if (preview.sampleTitles.length > 0) {
    const more = preview.variantCount - preview.sampleTitles.length;
    const shown = preview.sampleTitles.join(", ");
    lines.push(`Affected: ${shown}${more > 0 ? ` and ${more} more` : ""}`);
  }
  return lines.join("\n");
}
