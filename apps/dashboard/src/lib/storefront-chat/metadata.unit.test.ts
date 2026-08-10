import { describe, expect, it } from "vitest";
import { mergeStorefrontChatEnabled, readStorefrontChatEnabled } from "./metadata";

describe("storefront chat metadata", () => {
  it("reads enabled only when metadata.storefrontChat.enabled is true", () => {
    expect(readStorefrontChatEnabled(null)).toBe(false);
    expect(readStorefrontChatEnabled({ storefrontChat: { enabled: true } })).toBe(true);
    expect(readStorefrontChatEnabled({ storefrontChat: { enabled: false } })).toBe(false);
  });

  it("merges enabled while preserving unrelated metadata", () => {
    expect(mergeStorefrontChatEnabled(
      { oauthScopes: ["read_orders"], storefrontChat: { enabled: false } },
      true,
    )).toEqual({
      oauthScopes: ["read_orders"],
      storefrontChat: { enabled: true },
    });
  });
});
