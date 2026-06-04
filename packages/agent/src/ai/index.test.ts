import { afterEach, describe, expect, it, vi } from "vitest";

const createMessageMock = vi.fn();

vi.mock("./anthropic", () => ({
  anthropic: {
    messages: {
      create: createMessageMock,
    },
  },
}));

describe("generateText", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("uses deterministic text in explicit non-production E2E runs", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_TEST_RUN", "true");
    vi.stubEnv("E2E_AI_MODE", "deterministic");

    const { generateText, isDeterministicE2EAIEnabled } = await import("./index");
    const text = await generateText(
      "You are summarizing a customer support thread.",
      [{ role: "user", content: "Where is my order?" }],
    );

    expect(isDeterministicE2EAIEnabled()).toBe(true);
    expect(text).toContain("Where is my order?");
    expect(createMessageMock).not.toHaveBeenCalled();
  });

  it("does not allow deterministic E2E AI mode in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_TEST_RUN", "true");
    vi.stubEnv("E2E_AI_MODE", "deterministic");
    createMessageMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "provider response" }],
    });

    const { generateText, isDeterministicE2EAIEnabled } = await import("./index");
    const text = await generateText(
      "Draft a reply.",
      [{ role: "user", content: "Where is my order?" }],
    );

    expect(isDeterministicE2EAIEnabled()).toBe(false);
    expect(text).toBe("provider response");
    expect(createMessageMock).toHaveBeenCalled();
  });
});
