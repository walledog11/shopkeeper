import { describe, expect, it } from "vitest";
import { redactPii } from "./redact";

describe("redactPii", () => {
  it("scrubs emails inside strings", () => {
    expect(redactPii("contact taylor@example.com please")).toBe("contact <redacted email> please");
  });

  it("scrubs phone-like sequences inside strings", () => {
    expect(redactPii("call +1 415 555 0199 today")).toBe("call <redacted phone> today");
  });

  it("scrubs Shopify gids", () => {
    expect(redactPii("gid://shopify/Customer/123456")).toBe("<redacted id>");
  });

  it("redacts customer_id keys regardless of value type", () => {
    expect(redactPii({ customer_id: 1234567890 })).toEqual({ customer_id: "<redacted id>" });
    expect(redactPii({ customerId: "abc" })).toEqual({ customerId: "<redacted id>" });
    expect(redactPii({ shopify_customer_id: "x" })).toEqual({ shopify_customer_id: "<redacted id>" });
  });

  it("walks nested objects and arrays", () => {
    const input = {
      to: "jane@example.com",
      body: "hi",
      items: [{ note: "ping jane@example.com" }, { customerId: 42 }],
    };
    expect(redactPii(input)).toEqual({
      to: "<redacted email>",
      body: "hi",
      items: [{ note: "ping <redacted email>" }, { customerId: "<redacted id>" }],
    });
  });

  it("leaves non-PII primitives alone", () => {
    expect(redactPii(42)).toBe(42);
    expect(redactPii(true)).toBe(true);
    expect(redactPii(null)).toBe(null);
    expect(redactPii("hello world")).toBe("hello world");
  });
});
