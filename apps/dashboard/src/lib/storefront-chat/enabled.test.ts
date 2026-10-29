import { afterEach, describe, expect, it } from "vitest";
import {
  isStorefrontChatEnabledForIntegration,
  isStorefrontChatGloballyEnabled,
} from "./enabled";

const originalFlag = process.env.STOREFRONT_CHAT_ENABLED;

afterEach(() => {
  if (originalFlag === undefined) delete process.env.STOREFRONT_CHAT_ENABLED;
  else process.env.STOREFRONT_CHAT_ENABLED = originalFlag;
});

describe("isStorefrontChatGloballyEnabled", () => {
  it("is off when unset", () => {
    delete process.env.STOREFRONT_CHAT_ENABLED;
    expect(isStorefrontChatGloballyEnabled()).toBe(false);
  });

  it("is off for anything but the exact string true", () => {
    for (const value of ["", "false", "1", "TRUE", "yes"]) {
      process.env.STOREFRONT_CHAT_ENABLED = value;
      expect(isStorefrontChatGloballyEnabled()).toBe(false);
    }
  });

  it("is on for true", () => {
    process.env.STOREFRONT_CHAT_ENABLED = "true";
    expect(isStorefrontChatGloballyEnabled()).toBe(true);
  });
});

describe("isStorefrontChatEnabledForIntegration", () => {
  it("is off for metadata that says nothing about storefront chat", () => {
    expect(isStorefrontChatEnabledForIntegration(null)).toBe(false);
    expect(isStorefrontChatEnabledForIntegration(undefined)).toBe(false);
    expect(isStorefrontChatEnabledForIntegration({})).toBe(false);
    expect(isStorefrontChatEnabledForIntegration({ storefrontChat: {} })).toBe(false);
  });

  it("is off for shapes that are not an explicit boolean opt-in", () => {
    expect(isStorefrontChatEnabledForIntegration({ storefrontChat: true })).toBe(false);
    expect(isStorefrontChatEnabledForIntegration({ storefrontChat: "enabled" })).toBe(false);
    expect(isStorefrontChatEnabledForIntegration({ storefrontChat: { enabled: "true" } })).toBe(false);
    expect(isStorefrontChatEnabledForIntegration({ storefrontChat: { enabled: 1 } })).toBe(false);
    expect(isStorefrontChatEnabledForIntegration({ storefrontChat: { enabled: false } })).toBe(false);
  });

  it("is on only for an explicit opt-in", () => {
    expect(isStorefrontChatEnabledForIntegration({ storefrontChat: { enabled: true } })).toBe(true);
  });
});
