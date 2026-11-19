import { describe, expect, it } from "vitest"
import { formatRelativeTime } from "./date"

describe("formatRelativeTime", () => {
  it("uses one format from just now to a date", () => {
    const now = new Date("2026-06-14T12:00:00.000Z")
    expect(formatRelativeTime("2026-06-14T11:59:30.000Z", now)).toBe("just now")
    expect(formatRelativeTime("2026-06-14T11:30:00.000Z", now)).toBe("30 min ago")
    expect(formatRelativeTime("2026-06-14T09:00:00.000Z", now)).toBe("3 hr ago")
    expect(formatRelativeTime("2026-06-13T12:00:00.000Z", now)).toBe("yesterday")
    expect(formatRelativeTime("2026-06-10T12:00:00.000Z", now)).toBe("4 days ago")
    expect(formatRelativeTime("2026-05-14T12:00:00.000Z", now)).toBe("May 14")
  })
})
