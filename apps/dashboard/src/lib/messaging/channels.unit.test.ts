import { describe, expect, it } from "vitest";
import {
  getActionLogChannelInfo,
  getChannelBadgeClassName,
  getChannelInfo,
  getChannelLabel,
  getChannelOptions,
} from "./channels";

describe("channel metadata", () => {
  it("returns canonical labels, logos, and badge classes for known channels", () => {
    expect(getChannelInfo("email")).toEqual({
      name: "Email",
      label: "Email",
      logo: "/logos/email.svg",
      badgeClassName: "bg-blue-500/15 text-blue-400",
    });
    expect(getChannelLabel("dashboard_agent")).toBe("Dashboard");
    expect(getChannelLabel("sms_agent")).toBe("Telegram");
    expect(getChannelBadgeClassName("ig_dm")).toBe("bg-pink-500/15 text-pink-400");
  });

  it("falls back consistently for workspace and unknown channels", () => {
    expect(getChannelInfo(null)).toEqual({
      name: "Workspace",
      label: "Workspace",
      logo: "/logos/default.svg",
      badgeClassName: "bg-muted text-muted-foreground",
    });
    expect(getChannelInfo("whatsapp")).toEqual({
      name: "WhatsApp",
      label: "WhatsApp",
      logo: "/logos/default.svg",
      badgeClassName: "bg-muted text-muted-foreground",
    });
    expect(getChannelInfo("custom")).toEqual({
      name: "custom",
      label: "custom",
      logo: "/logos/default.svg",
      badgeClassName: "bg-muted text-muted-foreground",
    });
  });

  it("builds dashboard channel options from shared labels", () => {
    expect(getChannelOptions(["email", "dashboard_agent", "sms_agent"])).toEqual([
      { id: "email", label: "Email" },
      { id: "dashboard_agent", label: "Dashboard" },
      { id: "sms_agent", label: "Telegram" },
    ]);
  });

  it("can group operator channels for report labels", () => {
    expect(getChannelLabel("dashboard_agent", { operatorLabel: "internal" })).toBe("Internal");
    expect(getChannelLabel("sms_agent", { operatorLabel: "internal" })).toBe("Internal");
    expect(getChannelLabel("email", { operatorLabel: "internal" })).toBe("Email");
  });

  it("maps order-risk audit rows to Shopify branding", () => {
    expect(getActionLogChannelInfo({
      channelType: null,
      instruction: "order-risk-review:998877",
    })).toEqual(getChannelInfo("shopify"));
  });
});
