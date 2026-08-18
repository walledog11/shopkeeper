import { beforeEach, describe, expect, it, vi } from "vitest";

const constructorSpy = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(options: Record<string, unknown>) {
      constructorSpy(options);
    }
    messages = { create: vi.fn() };
  },
}));

describe("shared Anthropic client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("bounds request time and retries rather than taking the SDK defaults", async () => {
    const { anthropic } = await import("./anthropic");

    // The client is lazy behind a Proxy, so nothing is constructed until first use.
    expect(constructorSpy).not.toHaveBeenCalled();
    void anthropic.messages;

    expect(constructorSpy).toHaveBeenCalledTimes(1);
    const options = constructorSpy.mock.calls[0][0];
    expect(options.timeout).toBe(60_000);
    expect(options.maxRetries).toBe(1);
  });

  it("constructs the client once and reuses it", async () => {
    const { anthropic } = await import("./anthropic");

    void anthropic.messages;
    void anthropic.messages;

    expect(constructorSpy).toHaveBeenCalledTimes(1);
  });
});
