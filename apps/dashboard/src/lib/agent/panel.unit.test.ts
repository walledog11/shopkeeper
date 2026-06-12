import { describe, expect, it } from "vitest";
import { buildAgentPanelHref, inferAgentPanelSource } from "./panel";

describe("buildAgentPanelHref", () => {
  it("opens the desk chat panel on the dashboard home route", () => {
    expect(buildAgentPanelHref()).toBe("/dashboard?openAgent=1");
  });

  it("preserves a deep-linked session id", () => {
    expect(buildAgentPanelHref({ session: "session-42" })).toBe(
      "/dashboard?openAgent=1&session=session-42",
    );
  });

  it("supports alternate pathnames", () => {
    expect(buildAgentPanelHref({ pathname: "/dashboard/tickets" })).toBe(
      "/dashboard/tickets?openAgent=1",
    );
  });

  it("includes a ticket thread id when provided", () => {
    expect(buildAgentPanelHref({ pathname: "/dashboard/tickets", thread: "thread-9" })).toBe(
      "/dashboard/tickets?openAgent=1&thread=thread-9",
    );
  });
});

describe("inferAgentPanelSource", () => {
  it("detects tickets, home, review, and command sources", () => {
    expect(inferAgentPanelSource("/dashboard/tickets", new URLSearchParams())).toBe("tickets");
    expect(inferAgentPanelSource("/dashboard", new URLSearchParams())).toBe("home");
    expect(inferAgentPanelSource("/dashboard", new URLSearchParams("session=abc"))).toBe("review");
    expect(inferAgentPanelSource("/dashboard/orders", new URLSearchParams())).toBe("command");
  });
});
