import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatClockTime,
  formatDate,
  formatLastActivityTime,
  formatMonthYear,
  formatRelativeTime,
  formatShortDate,
  formatShortRelativeTime,
  formatUnixDate,
} from "./date";

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats recent timestamps for activity-style feeds", () => {
    expect(formatRelativeTime("2026-06-05T11:59:30.000Z")).toBe("just now");
    expect(formatRelativeTime("2026-06-05T11:45:00.000Z")).toBe("15m ago");
    expect(formatRelativeTime("2026-06-05T09:00:00.000Z")).toBe("3h ago");
    expect(formatRelativeTime("2026-06-04T12:00:00.000Z")).toBe("yesterday");
    expect(formatRelativeTime("2026-06-02T12:00:00.000Z")).toBe("3d ago");
    expect(formatRelativeTime("2026-05-20T12:00:00.000Z")).toBe("May 20");
  });

  it("formats short relative time variants for activity labels", () => {
    expect(formatShortRelativeTime("2026-06-05T11:45:00.000Z")).toBe("15m ago");
    expect(formatShortRelativeTime("2026-06-04T09:00:00.000Z")).toBe("1d ago");
    expect(formatLastActivityTime("2026-06-05T11:58:30.000Z")).toBe("just now");
    expect(formatLastActivityTime("2026-06-05T11:57:30.000Z")).toBe("2m ago");
  });

  it("handles invalid and future dates predictably", () => {
    expect(formatDate("not-a-date")).toBe("Unknown date");
    expect(formatShortDate("not-a-date", { fallback: "" })).toBe("");
    expect(formatUnixDate(null, { fallback: "-" })).toBe("-");
    expect(formatRelativeTime("not-a-date")).toBe("just now");
    expect(formatShortRelativeTime("2026-06-05T12:01:00.000Z")).toBe("just now");
  });

  it("formats canonical dashboard date variants", () => {
    expect(formatShortDate("2026-06-05T12:00:00.000Z", { timeZone: "UTC" })).toBe("Jun 5");
    expect(formatShortDate("2026-06-05T12:00:00.000Z", { includeYear: true, timeZone: "UTC" })).toBe("Jun 5, 2026");
    expect(formatMonthYear("2026-06-05T12:00:00.000Z", { timeZone: "UTC" })).toBe("Jun 2026");
    expect(formatUnixDate(Date.UTC(2026, 5, 5) / 1000, { timeZone: "UTC" })).toBe("Jun 5, 2026");
    expect(formatClockTime("2026-06-05T09:05:00.000Z", { timeZone: "UTC" })).toBe("09:05 AM");
  });
});
