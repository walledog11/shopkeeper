import type { OrgSettings } from "../types.js";
import { resolveAgentSettings } from "../settings.js";

/**
 * The blast-radius guard shared by every shop-management write.
 *
 * A refund risks one order's value and the existing per-call cap is enough to
 * bound it. A promotion or a reprice risks every unit that sells while it is
 * live, which is a different quantity: unbounded in time unless something makes
 * it expire, and unbounded in breadth unless something enumerates what it
 * touches. This is that something, and it is deliberately one module so
 * inventory and promotion writes cannot drift into two answers.
 *
 * Every violation is a code. The message is display, and no caller branches on
 * it.
 */

export const VALUE_AT_RISK_CODES = [
  "no_variants",
  "too_many_variants",
  "discount_too_deep",
  "value_at_risk_exceeded",
  "ttl_missing",
  "ttl_too_long",
] as const;

export type ValueAtRiskCode = (typeof VALUE_AT_RISK_CODES)[number];

export interface ValueAtRiskViolation {
  code: ValueAtRiskCode;
  /** Display only. Never matched on. */
  message: string;
  /** The bound that was crossed, in the unit the code implies. */
  limit: number;
  /** What the request asked for, in the same unit. */
  requested: number;
}

/** One variant a write would touch, priced so the exposure can be summed. */
export interface ValueAtRiskVariant {
  variantId: string;
  title?: string;
  unitPriceCents: number;
  /** Units the merchant could sell at the discounted price before it expires. */
  unitsAtRisk: number;
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
  /** Revenue the discount forgoes if every at-risk unit sells. */
  valueAtRiskCents: number;
  /** Gross revenue those units would have produced undiscounted. */
  grossExposureCents: number;
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
  maxValueAtRiskCents: number;
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
  maxValueAtRiskCents: 50_000,
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
    maxValueAtRiskCents: Math.max(0, Math.floor(
      s.maxPromotionValueAtRiskCents ?? VALUE_AT_RISK_DEFAULTS.maxValueAtRiskCents,
    )),
    maxTtlHours: Math.max(1, Math.floor(
      s.maxPromotionTtlHours ?? VALUE_AT_RISK_DEFAULTS.maxTtlHours,
    )),
  };
}

function grossExposure(variants: readonly ValueAtRiskVariant[]): number {
  return variants.reduce(
    (total, variant) => total + Math.max(0, variant.unitPriceCents) * Math.max(0, variant.unitsAtRisk),
    0,
  );
}

export function buildValueAtRiskPreview(
  request: ValueAtRiskRequest,
  now: Date = new Date(),
): ValueAtRiskPreview {
  const gross = grossExposure(request.variants);
  const discountPercent = clampPercent(request.discountPercent);
  return {
    variantCount: request.variants.length,
    sampleTitles: request.variants
      .slice(0, SAMPLE_TITLE_LIMIT)
      .map((variant) => variant.title ?? variant.variantId),
    discountPercent,
    valueAtRiskCents: Math.round((gross * discountPercent) / 100),
    grossExposureCents: gross,
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
      message: "No variants were named, so there is nothing to preview or bound.",
      limit: 1,
      requested: 0,
    });
  }

  if (request.variants.length > limits.maxVariants) {
    violations.push({
      code: "too_many_variants",
      message:
        `This would change ${request.variants.length} variants, over the limit of `
        + `${limits.maxVariants}. Name fewer variants, or raise the limit in Settings.`,
      limit: limits.maxVariants,
      requested: request.variants.length,
    });
  }

  if (preview.discountPercent > limits.maxDiscountPercent) {
    violations.push({
      code: "discount_too_deep",
      message:
        `A ${preview.discountPercent}% discount is deeper than the ${limits.maxDiscountPercent}% `
        + "limit. Lower the discount, or raise the limit in Settings.",
      limit: limits.maxDiscountPercent,
      requested: preview.discountPercent,
    });
  }

  if (preview.valueAtRiskCents > limits.maxValueAtRiskCents) {
    violations.push({
      code: "value_at_risk_exceeded",
      message:
        `This puts ${formatCents(preview.valueAtRiskCents)} of revenue at risk, over the `
        + `${formatCents(limits.maxValueAtRiskCents)} limit.`,
      limit: limits.maxValueAtRiskCents,
      requested: preview.valueAtRiskCents,
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
      message: "A promotion that expires immediately or in the past cannot run.",
      limit: limits.maxTtlHours,
      requested: request.ttlHours,
    });
  } else if (request.ttlHours > limits.maxTtlHours) {
    violations.push({
      code: "ttl_too_long",
      message:
        `Running for ${request.ttlHours} hours is longer than the `
        + `${limits.maxTtlHours}-hour limit.`,
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
    `Revenue at risk: ${formatCents(preview.valueAtRiskCents)} of `
      + `${formatCents(preview.grossExposureCents)}`,
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
