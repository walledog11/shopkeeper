import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { addShopifyCustomerNote, updateShopifyCustomerInfo, updateShopifyOrderAddress } from "./shopify.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shopify tools", () => {
  it("emits provider-observed customer-info facts for an identity-bearing update", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      customer: {
        id: 123,
        first_name: "Jane",
        last_name: "Smith",
        email: "jane@example.com",
        phone: "+14155550100",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyCustomerInfo({
      customer_id: "123",
      first_name: "Jane",
      email: "JANE@example.com",
    }, { ...ctx, operationId: "operation-customer-1", executionId: "execution-customer-1" });

    expect(result).toMatchObject({
      status: "ok",
      receipt: {
        tool: "update_shopify_customer_info",
        target: { kind: "customer", id: "123" },
        outcome: "succeeded",
        providerReference: "123",
        facts: {
          customerId: "123",
          updates: [
            { field: "firstName", value: "Jane" },
            { field: "email", value: "jane@example.com" },
          ],
        },
      },
    });
  });

  it("reconciles an incomplete customer-update response with a provider read", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ customer: { id: 123 } }))
      .mockResolvedValueOnce(jsonResponse({
        customer: { id: 123, first_name: "Jane", email: "jane@example.com" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyCustomerInfo({
      customer_id: "123",
      first_name: "Jane",
      email: "jane@example.com",
    }, { ...ctx, operationId: "operation-customer-1", executionId: "execution-customer-1" });

    expect(result.status).toBe("ok");
    expect(result.message).toContain("confirmed after an interrupted provider response");
    expect(result.receipt).toMatchObject({ outcome: "succeeded", providerReference: "123" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a customer update unknown when the provider state does not match", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ customer: { id: 123 } }))
      .mockResolvedValueOnce(jsonResponse({ customer: { id: 123, first_name: "Old" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyCustomerInfo({
      customer_id: "123",
      first_name: "Jane",
    }, { ...ctx, operationId: "operation-customer-1", executionId: "execution-customer-1" });

    expect(result).toMatchObject({
      status: "unknown",
      receipt: {
        tool: "update_shopify_customer_info",
        target: { kind: "customer", id: "123" },
        outcome: "unknown",
        code: "customer_update_not_confirmed",
        providerReference: "123",
      },
    });
  });

  it("reconciles a customer update after an ambiguous provider response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ errors: "upstream unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ customer: { id: 123, phone: "+14155550100" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyCustomerInfo({
      customer_id: "123",
      phone: "+14155550100",
    }, { ...ctx, operationId: "operation-customer-1", executionId: "execution-customer-1" });

    expect(result.status).toBe("ok");
    expect(result.message).toContain("confirmed after an interrupted provider response");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a typed not-found outcome for a missing customer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(
      { errors: "Not found" },
      { status: 404 },
    )));

    const result = await updateShopifyCustomerInfo({
      customer_id: "123",
      first_name: "Jane",
    }, { ...ctx, operationId: "operation-customer-1", executionId: "execution-customer-1" });

    expect(result).toMatchObject({
      status: "not_found",
      receipt: {
        tool: "update_shopify_customer_info",
        outcome: "not_found",
        code: "customer_not_found",
        providerReference: null,
      },
    });
  });

  it("rejects an empty customer update before provider dispatch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyCustomerInfo({ customer_id: "123" }, {
      ...ctx,
      operationId: "operation-customer-1",
      executionId: "execution-customer-1",
    });

    expect(result).toMatchObject({
      status: "policy_block",
      receipt: {
        outcome: "rejected",
        code: "invalid_customer_update_input",
        target: { kind: "customer", id: "123" },
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not overwrite a customer note when fetching the existing note fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ errors: "Not found" }, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await addShopifyCustomerNote({ customer_id: "123", note: "New note" }, ctx);

    expect(result.message).toContain("Error: failed to add note");
    expect(result.status).toBe("not_found");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("emits a hash-bound receipt after appending a customer note", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ customer: { id: 123, note: "Existing" } }))
      .mockResolvedValueOnce(jsonResponse({ customer: { id: 123, note: "Existing\n\nFollow up" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await addShopifyCustomerNote({ customer_id: "123", note: "Follow up" }, {
      ...ctx,
      operationId: "operation-note-1",
      executionId: "execution-note-1",
    });

    expect(result).toMatchObject({
      status: "ok",
      receipt: {
        tool: "add_shopify_customer_note",
        target: { kind: "customer", id: "123" },
        outcome: "succeeded",
        providerReference: "123",
        facts: {
          customerId: "123",
          resultingNoteLength: 19,
          appendState: "appended",
        },
      },
    });
    const facts = (result.receipt as Extract<NonNullable<typeof result.receipt>, {
      tool: "add_shopify_customer_note";
      outcome: "succeeded";
    }>).facts;
    expect(facts.previousNoteSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(facts.appendedNoteSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(facts.resultingNoteSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(facts)).not.toContain("Follow up");
  });

  it("reconciles an incomplete customer-note response without appending twice", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ customer: { id: 123, note: "Existing" } }))
      .mockResolvedValueOnce(jsonResponse({ customer: { id: 123 } }))
      .mockResolvedValueOnce(jsonResponse({ customer: { id: 123, note: "Existing\n\nFollow up" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await addShopifyCustomerNote({ customer_id: "123", note: "Follow up" }, {
      ...ctx,
      operationId: "operation-note-1",
      executionId: "execution-note-1",
    });

    expect(result.status).toBe("ok");
    expect(result.message).toContain("confirmed after an interrupted provider response");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([, init]) => init.method === "PUT")).toHaveLength(1);
  });

  it("keeps a customer-note append unknown when read-back does not match", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ customer: { id: 123, note: "Existing" } }))
      .mockResolvedValueOnce(jsonResponse({ customer: { id: 123 } }))
      .mockResolvedValueOnce(jsonResponse({ customer: { id: 123, note: "Different" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await addShopifyCustomerNote({ customer_id: "123", note: "Follow up" }, {
      ...ctx,
      operationId: "operation-note-1",
      executionId: "execution-note-1",
    });

    expect(result).toMatchObject({
      status: "unknown",
      receipt: {
        tool: "add_shopify_customer_note",
        outcome: "unknown",
        code: "customer_note_not_confirmed",
        providerReference: "123",
      },
    });
  });

  it("stops the plan on a partial order-address update", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        order: {
          id: 456,
          name: "#1001",
          order_number: 1001,
          fulfillment_status: null,
          customer: { id: 123 },
          shipping_address: {
            address1: "Old address",
            city: "Los Angeles",
            province: "CA",
            zip: "90001",
            country: "United States",
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        customer: {
          default_address: {
            id: 789,
            address1: "Old address",
            city: "Los Angeles",
            province: "CA",
            zip: "90001",
            country: "United States",
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        order: {
          id: 456,
          order_number: 1001,
          shipping_address: {
            address1: "123 Main St",
            city: "Los Angeles",
            province: "CA",
            zip: "90001",
            country: "United States",
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ errors: "Customer not found" }, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress({
      order_id: "456",
      customer_id: "123",
      address1: "123 Main St",
      city: "Los Angeles",
      province: "CA",
      zip: "90001",
      country: "United States",
    }, ctx);

    expect(result.message).toContain("order shipping address was updated");
    expect(result.message).toContain("customer profile sync failed");
    expect(result.status).toBe("unknown");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
