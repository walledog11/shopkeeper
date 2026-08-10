import { describe, expect, it } from "vitest";
import {
  INTEGRATION_CHANNEL_SECTIONS,
  INTEGRATION_DEFINITIONS,
  sortIntegrationDefinitionsByChannelKind,
} from "./catalog";

describe("integration catalog", () => {
  it("groups iMessage and Telegram under operator channels", () => {
    expect(INTEGRATION_CHANNEL_SECTIONS.map((s) => s.kind)).toEqual(["support", "operator"]);
    expect(INTEGRATION_CHANNEL_SECTIONS.find((s) => s.kind === "operator")).toMatchObject({
      title: "Operator channels",
    });

    const operatorIds = INTEGRATION_DEFINITIONS
      .filter((def) => def.channelKind === "operator")
      .map((def) => def.id);
    expect(operatorIds).toContain("imessage");
    expect(operatorIds).toContain("telegram");
    expect(operatorIds).toContain("whatsapp");
  });

  it("orders operator channels with iMessage before Telegram", () => {
    const operator = sortIntegrationDefinitionsByChannelKind(INTEGRATION_DEFINITIONS, "operator").map((def) => def.id);

    expect(operator).toEqual(["imessage", "telegram", "shopify", "whatsapp"]);
  });

});
