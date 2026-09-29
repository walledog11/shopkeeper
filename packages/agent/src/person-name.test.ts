import { describe, expect, it } from "vitest";
import {
  classifyPerson,
  customerFirstName,
  personLabel,
} from "./person-name.js";

describe("customerFirstName", () => {
  // The operator card's copy split on a single space without trimming, so a
  // leading space made the whole card nameless while the briefing named them.
  it("survives surrounding and repeated whitespace", () => {
    expect(customerFirstName("  Sarah Chen ")).toBe("Sarah");
    expect(customerFirstName("Sarah  Chen")).toBe("Sarah");
    expect(customerFirstName("   ")).toBeNull();
    expect(customerFirstName(null)).toBeNull();
  });
});

describe("classifyPerson", () => {
  // The platform writes "Customer" where it has no name; echoing it back claims
  // an identification that never happened.
  it("does not treat the placeholder 'Customer' as a name", () => {
    expect(classifyPerson({ customerName: "Customer", channelType: "email" }).kind).toBe("unknown");
    expect(classifyPerson({ customerName: "customer 4821", channelType: "shopify_chat" }).kind).toBe(
      "visitor",
    );
  });

  it("names the orders a storefront shopper proved control of", () => {
    expect(
      classifyPerson({
        customerName: null,
        channelType: "shopify_chat",
        verifiedOrders: ["#1024", "#1030"],
      }),
    ).toEqual({ kind: "verified", orders: ["#1024", "#1030"] });
  });

  // Verification is scoped to an order, never to an account — and only storefront
  // chat has a verification flow at all.
  it("ignores verified orders on channels that cannot verify", () => {
    expect(
      classifyPerson({ customerName: null, channelType: "email", verifiedOrders: ["#1024"] }).kind,
    ).toBe("unknown");
  });

  it("drops orders the following sentence already names", () => {
    expect(
      classifyPerson({
        customerName: null,
        channelType: "shopify_chat",
        verifiedOrders: ["#1024"],
        followingText: "requested a refund on order 1024",
      }),
    ).toEqual({ kind: "verified", orders: [] });
  });
});

describe("renderers", () => {
  const named = classifyPerson({ customerName: "Sarah Chen", channelType: "email" });
  const verified = classifyPerson({
    customerName: null,
    channelType: "shopify_chat",
    verifiedOrders: ["#1024"],
  });
  const visitor = classifyPerson({ customerName: null, channelType: "shopify_chat" });
  const unknown = classifyPerson({ customerName: null, channelType: "email" });

  it("labels a list row, and says nothing when there is nothing to say", () => {
    expect(personLabel(named)).toBe("Sarah");
    expect(personLabel(verified)).toBe("The customer on #1024");
    expect(personLabel(visitor)).toBe("Storefront visitor");
    // Null, not "Someone": the caller has an order reference to fall back to.
    expect(personLabel(unknown)).toBeNull();
  });
});
