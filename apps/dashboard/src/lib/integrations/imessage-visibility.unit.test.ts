import { describe, expect, it } from "vitest";
import {
  filterImessagePlatformConfigs,
  normalizeImessageLineHandle,
  shouldShowImessageIntegration,
} from "./imessage-visibility";

const configs = [
  { id: "shopify", name: "Shopify" },
  { id: "imessage", name: "iMessage" },
  { id: "telegram", name: "Telegram" },
];

describe("iMessage integration visibility", () => {
  it("normalizes empty handles to null", () => {
    expect(normalizeImessageLineHandle(undefined)).toBeNull();
    expect(normalizeImessageLineHandle(null)).toBeNull();
    expect(normalizeImessageLineHandle("   ")).toBeNull();
    expect(normalizeImessageLineHandle("+16282647754")).toBe("+16282647754");
  });

  it("hides iMessage until a line handle is configured", () => {
    expect(shouldShowImessageIntegration(undefined)).toBe(false);
    expect(shouldShowImessageIntegration({ lineHandle: null })).toBe(false);
    expect(filterImessagePlatformConfigs(configs, { lineHandle: null }).map((c) => c.id)).toEqual([
      "shopify",
      "telegram",
    ]);
  });

  it("shows iMessage when a line handle is present", () => {
    expect(shouldShowImessageIntegration({ lineHandle: "+16282647754" })).toBe(true);
    expect(filterImessagePlatformConfigs(configs, { lineHandle: "+16282647754" }).map((c) => c.id)).toEqual([
      "shopify",
      "imessage",
      "telegram",
    ]);
  });
});
