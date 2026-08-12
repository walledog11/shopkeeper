import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startImessageBinding,
  startTelegramBinding,
} from "./channel-binding-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("channel binding client", () => {
  it("normalizes an iMessage binding response with its expiration", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      token: " bind-token ",
      expiresInSeconds: 60,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startImessageBinding({ now: () => 1_000 })).resolves.toEqual({
      value: "bind-token",
      expiresAt: 61_000,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/integrations/imessage/bind",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("accepts only secure Telegram links", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      url: "https://t.me/ShopkeeperBot?start=token",
      expiresInSeconds: 120,
    }), { status: 200 })));

    await expect(startTelegramBinding({ now: () => 5_000 })).resolves.toEqual({
      value: "https://t.me/ShopkeeperBot?start=token",
      expiresAt: 125_000,
    });
  });

  it.each([
    { token: "", expiresInSeconds: 60 },
    { token: "token" },
    { token: "token", expiresInSeconds: 0 },
  ])("rejects malformed iMessage payloads %#", async (payload) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify(payload),
      { status: 200 },
    )));

    await expect(startImessageBinding()).rejects.toThrow("Couldn't create a connect code.");
  });

  it("rejects non-HTTPS Telegram links", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      url: "javascript:alert(1)",
      expiresInSeconds: 60,
    }), { status: 200 })));

    await expect(startTelegramBinding()).rejects.toThrow("Couldn't start Telegram connect.");
  });

  it("rejects secure links to an unexpected host", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      url: "https://example.com/pretend-telegram",
      expiresInSeconds: 60,
    }), { status: 200 })));

    await expect(startTelegramBinding()).rejects.toThrow("Couldn't start Telegram connect.");
  });

  it("preserves an API error returned by the server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "Device limit reached.",
    }), { status: 409 })));

    await expect(startTelegramBinding()).rejects.toThrow("Device limit reached.");
  });

  it("uses a safe message for network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network internals")));

    await expect(startImessageBinding()).rejects.toThrow("Couldn't create a connect code.");
  });
});
