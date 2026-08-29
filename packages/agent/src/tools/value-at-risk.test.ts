import { describe, expect, it } from "vitest";
import { resolveAgentSettings } from "../settings.js";
import {
  VALUE_AT_RISK_DEFAULTS,
  assessValueAtRisk,
  buildValueAtRiskPreview,
  formatValueAtRiskPreview,
  formatValueAtRiskRefusal,
  resolveValueAtRiskLimits,
  type ValueAtRiskVariant,
} from "./value-at-risk.js";

const NOW = new Date("2026-04-29T12:00:00Z");

function variants(count: number): ValueAtRiskVariant[] {
  return Array.from({ length: count }, (_, index) => ({
    variantId: `gid://shopify/ProductVariant/${index}`,
    title: `Variant ${index}`,
  }));
}

function codes(assessment: ReturnType<typeof assessValueAtRisk>): string[] {
  return assessment.violations.map((violation) => violation.code);
}

describe("assessValueAtRisk", () => {
  it("passes a small, shallow, expiring promotion", () => {
    const assessment = assessValueAtRisk(
      { variants: variants(3), discountPercent: 10, ttlHours: 48 },
      undefined,
      NOW,
    );

    expect(assessment.ok).toBe(true);
    expect(assessment.violations).toEqual([]);
  });

  // The Milestone 7 acceptance criterion, stated as the thing it forbids.
  it("blocks a catalog-wide 90% discount", () => {
    const assessment = assessValueAtRisk(
      { variants: variants(500), discountPercent: 90, ttlHours: 24 },
      undefined,
      NOW,
    );

    expect(assessment.ok).toBe(false);
    expect(codes(assessment)).toContain("too_many_variants");
    expect(codes(assessment)).toContain("discount_too_deep");
  });

  // Depth alone is enough: a 90% cut on one product is still refused, so the
  // guard is not something a small enough SKU list can walk past.
  it("blocks a deep discount even on a single variant", () => {
    const assessment = assessValueAtRisk(
      { variants: variants(1), discountPercent: 90, ttlHours: 24 },
      undefined,
      NOW,
    );

    expect(assessment.ok).toBe(false);
    expect(codes(assessment)).toEqual(["discount_too_deep"]);
  });

  it("requires an expiry rather than defaulting to one", () => {
    const assessment = assessValueAtRisk(
      { variants: variants(2), discountPercent: 10, ttlHours: null },
      undefined,
      NOW,
    );

    expect(assessment.ok).toBe(false);
    expect(codes(assessment)).toEqual(["ttl_missing"]);
  });

  it("treats a zero or negative expiry as no expiry", () => {
    for (const ttlHours of [0, -5]) {
      const assessment = assessValueAtRisk(
        { variants: variants(2), discountPercent: 10, ttlHours },
        undefined,
        NOW,
      );
      expect(codes(assessment)).toEqual(["ttl_missing"]);
    }
  });

  it("bounds how long a promotion may run", () => {
    const assessment = assessValueAtRisk(
      { variants: variants(2), discountPercent: 10, ttlHours: 24 * 30 },
      undefined,
      NOW,
    );

    expect(codes(assessment)).toEqual(["ttl_too_long"]);
  });

  // An empty variant list is the shape a wildcard would arrive as if one
  // existed. It is a violation, not an empty no-op that quietly succeeds.
  it("refuses a write that names no variants", () => {
    const assessment = assessValueAtRisk(
      { variants: [], discountPercent: 10, ttlHours: 24 },
      undefined,
      NOW,
    );

    expect(assessment.ok).toBe(false);
    expect(codes(assessment)).toContain("no_variants");
  });

  // The guard bounds how far an instruction can be misread, never how much
  // revenue the merchant chooses to forgo. A markdown on a high-value catalogue
  // is a pricing decision with an owner, and that owner is not this module.
  it("allows a high-value markdown inside the count and depth bounds", () => {
    const assessment = assessValueAtRisk(
      { variants: variants(10), discountPercent: 30, ttlHours: 24 },
      undefined,
      NOW,
    );

    expect(assessment.ok).toBe(true);
    expect(assessment.violations).toEqual([]);
  });

  it("reports every violation in one pass", () => {
    const assessment = assessValueAtRisk(
      { variants: variants(500), discountPercent: 90, ttlHours: null },
      undefined,
      NOW,
    );

    expect(codes(assessment)).toEqual([
      "too_many_variants",
      "discount_too_deep",
      "ttl_missing",
    ]);
  });

  it("honours a merchant's raised limits", () => {
    const settings = resolveAgentSettings({
      maxPromotionVariants: 1_000,
      maxPromotionDiscountPercent: 95,
      maxPromotionTtlHours: 24 * 30,
    });

    const assessment = assessValueAtRisk(
      { variants: variants(500), discountPercent: 90, ttlHours: 24 * 29 },
      settings,
      NOW,
    );

    expect(assessment.ok).toBe(true);
  });
});

describe("resolveValueAtRiskLimits", () => {
  it("falls back to the shipped defaults when nothing is configured", () => {
    expect(resolveValueAtRiskLimits(resolveAgentSettings(null))).toEqual(VALUE_AT_RISK_DEFAULTS);
  });
});

describe("buildValueAtRiskPreview", () => {
  it("counts what is touched and dates the expiry", () => {
    const preview = buildValueAtRiskPreview(
      { variants: variants(4), discountPercent: 25, ttlHours: 12 },
      NOW,
    );

    expect(preview.variantCount).toBe(4);
    expect(preview.discountPercent).toBe(25);
    expect(preview.expiresAt?.toISOString()).toBe("2026-04-30T00:00:00.000Z");
  });

  it("samples titles without misreporting the count", () => {
    const preview = buildValueAtRiskPreview(
      { variants: variants(9), discountPercent: 10, ttlHours: 1 },
      NOW,
    );

    expect(preview.variantCount).toBe(9);
    expect(preview.sampleTitles).toHaveLength(5);
    expect(formatValueAtRiskPreview(preview)).toContain("and 4 more");
  });

  it("clamps a nonsensical percentage rather than trusting it", () => {
    const preview = buildValueAtRiskPreview(
      { variants: variants(1), discountPercent: 400, ttlHours: 1 },
      NOW,
    );

    expect(preview.discountPercent).toBe(100);
  });
});

describe("formatValueAtRiskRefusal", () => {
  it("says nothing was applied and lists each reason", () => {
    const assessment = assessValueAtRisk(
      { variants: variants(500), discountPercent: 90, ttlHours: null },
      undefined,
      NOW,
    );
    const refusal = formatValueAtRiskRefusal(assessment);

    expect(refusal).toContain("nothing was applied");
    for (const violation of assessment.violations) {
      expect(refusal).toContain(violation.message);
    }
  });

  it("never sends the merchant to a Settings control that does not exist", () => {
    // No promotion bound is writable from either app, so a refusal that offers
    // "raise the limit in Settings" is a remedy the merchant cannot take.
    const cases = [
      { variants: variants(0), discountPercent: 0, ttlHours: 1 },
      { variants: variants(500), discountPercent: 90, ttlHours: null },
      { variants: variants(1), discountPercent: 90, ttlHours: 0 },
      { variants: variants(1), discountPercent: 1, ttlHours: 10_000 },
    ];

    for (const request of cases) {
      const assessment = assessValueAtRisk(request, undefined, NOW);
      expect(assessment.violations.length).toBeGreaterThan(0);
      expect(formatValueAtRiskRefusal(assessment)).not.toContain("Settings");
    }
  });
});
