import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { attachReturnLabel } from "./return-labels.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

function orderReturnsResponse(status = "OPEN"): Response {
  return jsonResponse({
    data: {
      order: {
        returns: {
          edges: [
            {
              node: {
                id: "gid://shopify/Return/999",
                name: "#2001-R1",
                status,
                reverseFulfillmentOrders: {
                  edges: [{ node: { id: "gid://shopify/ReverseFulfillmentOrder/555" } }],
                },
              },
            },
          ],
        },
      },
    },
  });
}

const input = {
  order_id: "2001",
  label_url: "https://labels.example.com/rma-2001.pdf",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("attachReturnLabel", () => {
  it("rejects a non-URL label before calling Shopify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await attachReturnLabel({ ...input, label_url: "not a url" }, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("label_url must be a valid URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("errors when the order has no open return", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(orderReturnsResponse("CLOSED"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await attachReturnLabel(input, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("no open return");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates the reverse delivery with the label and tracking on the happy path", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderReturnsResponse())
      .mockResolvedValueOnce(jsonResponse({
        data: {
          reverseDeliveryCreateWithShipping: {
            reverseDelivery: { id: "gid://shopify/ReverseDelivery/777" },
            userErrors: [],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await attachReturnLabel({ ...input, tracking_number: "1Z999" }, ctx);

    const request = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(request.variables).toEqual({
      reverseFulfillmentOrderId: "gid://shopify/ReverseFulfillmentOrder/555",
      labelInput: { fileUrl: "https://labels.example.com/rma-2001.pdf" },
      trackingInput: { number: "1Z999" },
    });
    expect(result.status).toBe("ok");
    expect(result.message).toContain("#2001-R1");
    expect(result.message).toContain("https://labels.example.com/rma-2001.pdf");
  });

  // A dropped connection after the reverse-delivery mutation went out can leave
  // a label attached at Shopify. Reporting that as a flat failure invites the
  // retry that attaches a second one.
  it("reports an interrupted reverse-delivery mutation as unknown, not failed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderReturnsResponse())
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await attachReturnLabel(input, ctx);

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("Do not attach another label");
  });

  // The lookup runs before any mutation, so its failure committed nothing and
  // must not be laundered into an ambiguous outcome.
  it("keeps a failed return lookup an error", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await attachReturnLabel(input, ctx);

    expect(result.status).toBe("error");
  });

  // Item 9's classification: Shopify refused the document, so nothing ran.
  it("keeps a rejected document an error", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderReturnsResponse())
      .mockResolvedValueOnce(jsonResponse({
        errors: [{ message: "Variable $notifyCustomer is declared by reverseDeliveryCreateWithShipping but not used" }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await attachReturnLabel(input, ctx);

    expect(result.status).toBe("error");
  });
});
