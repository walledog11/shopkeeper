import { describe, expect, it } from "vitest";
import {
  INTEGRATION_CHANNEL_SECTIONS,
  PLATFORM_CONFIG,
  sortPlatformConfigsByChannelKind,
} from "./catalog";
import { filterOperatorPlatformConfigs } from "./operator-channel-visibility";

describe("integration catalog", () => {
  it("groups iMessage and Telegram under operator channels", () => {
    expect(INTEGRATION_CHANNEL_SECTIONS.map((s) => s.kind)).toEqual(["support", "operator"]);
    expect(INTEGRATION_CHANNEL_SECTIONS.find((s) => s.kind === "operator")).toMatchObject({
      title: "Operator channels",
    });

    const operatorIds = PLATFORM_CONFIG
      .filter((def) => def.channelKind === "operator")
      .map((def) => def.id);
    expect(operatorIds).toContain("imessage");
    expect(operatorIds).toContain("telegram");
    expect(operatorIds).toContain("whatsapp");
  });

  it("orders operator channels with iMessage before Telegram", () => {
    const visible = filterOperatorPlatformConfigs(PLATFORM_CONFIG, {
      telegram: { botUsername: "ShopkeeperBot" },
      imessage: { lineHandle: "+16282647754" },
    });
    const operator = sortPlatformConfigsByChannelKind(visible, "operator").map((def) => def.id);

    expect(operator).toEqual(["imessage", "telegram", "shopify", "whatsapp"]);
  });

  it("hides operator messaging cards when neither channel is configured", () => {
    const visible = filterOperatorPlatformConfigs(PLATFORM_CONFIG, {
      telegram: { botUsername: null },
      imessage: { lineHandle: null },
    });
    const operator = sortPlatformConfigsByChannelKind(visible, "operator").map((def) => def.id);

    expect(operator).toEqual(["shopify", "whatsapp"]);
    expect(operator).not.toContain("imessage");
    expect(operator).not.toContain("telegram");
  });
});
