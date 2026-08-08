import { describe, expect, it } from "vitest";
import { DEFAULT_DATA } from "../_components/model";
import { parseStoredOnboardingState } from "./onboarding-state";

describe("parseStoredOnboardingState", () => {
  it("returns validated onboarding data without leaking storage metadata", () => {
    expect(parseStoredOnboardingState(JSON.stringify({
      storeName: "Acme",
      founderName: "Ari",
      primaryEmail: "support@acme.test",
      idx: 3,
      ignored: "value",
    }))).toEqual({
      data: {
        forwardingEmail: "",
        storeName: "Acme",
        founderName: "Ari",
        gmailEmail: "",
        primaryEmail: "support@acme.test",
      },
      idx: 3,
    });
  });

  it.each([
    null,
    "",
    "not-json",
    "[]",
    "null",
  ])("rejects an invalid storage envelope: %j", (raw) => {
    expect(parseStoredOnboardingState(raw)).toBeNull();
  });

  it.each([-1, 1.5, 99])("resets an invalid step index: %s", (idx) => {
    expect(parseStoredOnboardingState(JSON.stringify({ idx }))).toEqual({
      data: DEFAULT_DATA,
      idx: 0,
    });
  });

  it("replaces invalid field values with safe defaults", () => {
    expect(parseStoredOnboardingState(JSON.stringify({
      storeName: null,
      founderName: 42,
      primaryEmail: [],
      idx: 1,
    }))).toEqual({
      data: DEFAULT_DATA,
      idx: 1,
    });
  });
});
