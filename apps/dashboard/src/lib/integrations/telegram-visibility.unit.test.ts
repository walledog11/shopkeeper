import { describe, expect, it } from "vitest";
import {
  filterTelegramPlatformConfigs,
  shouldShowTelegramIntegration,
} from "./telegram-visibility";

const configs = [
  { id: "shopify", name: "Shopify" },
  { id: "telegram", name: "Telegram" },
  { id: "email", name: "Email" },
];

describe("Telegram integration visibility", () => {
  it("hides Telegram until a bot username is configured", () => {
    expect(shouldShowTelegramIntegration(undefined)).toBe(false);
    expect(shouldShowTelegramIntegration({ botUsername: null })).toBe(false);
    expect(filterTelegramPlatformConfigs(configs, { botUsername: null }).map((c) => c.id)).toEqual([
      "shopify",
      "email",
    ]);
  });

  it("shows Telegram when a bot username is present", () => {
    expect(shouldShowTelegramIntegration({ botUsername: "ShopkeeperBot" })).toBe(true);
    expect(filterTelegramPlatformConfigs(configs, { botUsername: "ShopkeeperBot" }).map((c) => c.id)).toEqual([
      "shopify",
      "telegram",
      "email",
    ]);
  });
});
