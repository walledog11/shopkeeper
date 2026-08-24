import { describe, expect, it } from "vitest"
import {
  clerkErrorMessage,
  formatSessionActivity,
  isClerkAccountOverviewHash,
  passwordStatusLabel,
  passwordUpdateError,
} from "./account-settings-helpers"

describe("isClerkAccountOverviewHash", () => {
  it("treats empty and account hashes as the overview", () => {
    expect(isClerkAccountOverviewHash("")).toBe(true)
    expect(isClerkAccountOverviewHash("#")).toBe(true)
    expect(isClerkAccountOverviewHash("#/")).toBe(true)
    expect(isClerkAccountOverviewHash("#/account")).toBe(true)
  })

  it("treats nested Clerk pages as off the overview", () => {
    expect(isClerkAccountOverviewHash("#/user")).toBe(false)
    expect(isClerkAccountOverviewHash("#/email-address")).toBe(false)
  })
})

describe("passwordStatusLabel", () => {
  it("describes whether a password already exists", () => {
    expect(passwordStatusLabel(true)).toBe("Password is set for this account.")
    expect(passwordStatusLabel(false)).toBe(
      "No password yet. Set one to also sign in with email.",
    )
  })
})

describe("passwordUpdateError", () => {
  it("requires the current password when one already exists", () => {
    expect(
      passwordUpdateError({
        passwordEnabled: true,
        currentPassword: "",
        newPassword: "abcdefgh",
        confirmPassword: "abcdefgh",
      }),
    ).toBe("Enter your current password.")
  })

  it("requires eight characters and a matching confirmation", () => {
    expect(
      passwordUpdateError({
        passwordEnabled: false,
        currentPassword: "",
        newPassword: "short",
        confirmPassword: "short",
      }),
    ).toBe("Password must be at least 8 characters.")
    expect(
      passwordUpdateError({
        passwordEnabled: false,
        currentPassword: "",
        newPassword: "abcdefgh",
        confirmPassword: "abcdxxxx",
      }),
    ).toBe("Passwords do not match.")
    expect(
      passwordUpdateError({
        passwordEnabled: false,
        currentPassword: "",
        newPassword: "abcdefgh",
        confirmPassword: "abcdefgh",
      }),
    ).toBeNull()
  })
})

describe("clerkErrorMessage", () => {
  it("prefers Clerk long messages", () => {
    expect(
      clerkErrorMessage(
        { errors: [{ longMessage: "Password is too short.", message: "short" }] },
        "fallback",
      ),
    ).toBe("Password is too short.")
  })

  it("falls back to Error messages and then the default", () => {
    expect(clerkErrorMessage(new Error("Nope"), "fallback")).toBe("Nope")
    expect(clerkErrorMessage({}, "fallback")).toBe("fallback")
  })
})

describe("formatSessionActivity", () => {
  it("joins client and location details", () => {
    expect(
      formatSessionActivity({
        latestActivity: {
          browserName: "Chrome",
          deviceType: "Mac",
          city: "Vancouver",
          country: "CA",
        },
      }),
    ).toBe("Chrome on Mac · Vancouver, CA")
  })

  it("uses a fallback when Clerk has no activity", () => {
    expect(formatSessionActivity({})).toBe("Unknown device")
  })
})
