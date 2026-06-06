import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatDate,
  formatLastActivityTime,
  formatRelativeTime,
  formatRelativeTimestamp,
  formatShortRelativeTime,
  formatSyncRelativeTime,
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

  it("formats compact timestamps for action log rows", () => {
    expect(formatRelativeTimestamp("2026-06-05T11:59:30.000Z")).toBe("just now");
    expect(formatRelativeTimestamp("2026-06-05T11:45:00.000Z")).toBe("15m ago");
    expect(formatRelativeTimestamp("2026-06-05T09:00:00.000Z")).toBe("3h ago");
    expect(formatRelativeTimestamp("2026-06-04T12:00:00.000Z")).toBe("Jun 4");
    expect(formatRelativeTimestamp("2025-12-25T12:00:00.000Z")).toBe("Dec 25, 2025");
  });

  it("formats short relative time variants for sync and activity labels", () => {
    expect(formatShortRelativeTime("2026-06-05T11:45:00.000Z")).toBe("15m ago");
    expect(formatShortRelativeTime("2026-06-04T09:00:00.000Z")).toBe("1d ago");
    expect(formatLastActivityTime("2026-06-05T11:58:30.000Z")).toBe("just now");
    expect(formatLastActivityTime("2026-06-05T11:57:30.000Z")).toBe("2m ago");
    expect(formatSyncRelativeTime(Date.now() - 45_000)).toBe("45s ago");
    expect(formatSyncRelativeTime(Date.now() - 15 * 60_000)).toBe("15 min ago");
  });

  it("handles invalid and future dates predictably", () => {
    expect(formatDate("not-a-date")).toBe("Unknown date");
    expect(formatRelativeTime("not-a-date")).toBe("just now");
    expect(formatRelativeTimestamp(null)).toBe("just now");
    expect(formatShortRelativeTime("2026-06-05T12:01:00.000Z")).toBe("just now");
  });
});
