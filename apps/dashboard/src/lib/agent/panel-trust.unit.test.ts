import { describe, expect, it } from "vitest";
import { buildPanelTrustLine } from "./panel-trust";

describe("buildPanelTrustLine", () => {
  it("uses merchant-facing tier labels", () => {
    expect(buildPanelTrustLine("guarded").label).toBe("Ask first");
    expect(buildPanelTrustLine("watch").label).toBe("Draft only");
    expect(buildPanelTrustLine("trusted").label).toBe("Trusted");
  });

  it("describes approval boundaries per tier", () => {
    expect(buildPanelTrustLine("watch").detail).toContain("draft");
    expect(buildPanelTrustLine("guarded").detail).toContain("refunds");
    expect(buildPanelTrustLine("trusted").detail).toContain("refunds");
  });
});
