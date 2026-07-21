import { describe, expect, it } from "vitest";
import { formatReturnArrivedNotification } from "./return-status.js";

describe("formatReturnArrivedNotification", () => {
  it("names the customer and return when notifying the operator", () => {
    expect(formatReturnArrivedNotification({
      customerName: "Sarah Kim",
      orderId: "1001",
      returnName: "#R1042",
      refundAmount: "$42",
    })).toBe(
      "Sarah Kim's return #R1042 arrived back. Ready to approve the $42 refund when you are. Reply yes on the dashboard plan when it lands, or text me to review it.",
    );
  });
});
