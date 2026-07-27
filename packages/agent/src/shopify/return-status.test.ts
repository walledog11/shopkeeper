import { describe, expect, it } from "vitest";
import { formatReturnClosedNotification } from "./return-status.js";

describe("formatReturnClosedNotification", () => {
  it("names the customer and return without claiming carrier-confirmed arrival", () => {
    expect(formatReturnClosedNotification({
      customerName: "Sarah Kim",
      orderId: "1001",
      returnName: "#R1042",
      refundAmount: "$42",
    })).toBe(
      "Sarah Kim's return #R1042 is marked closed in Shopify. Review whether the $42 refund is still due. Verify that the returned goods were received before approving the dashboard plan, or text me to review it.",
    );
  });
});
