import { createHash } from "node:crypto";
import type {
  AddShopifyCustomerNoteInput,
  FindCustomerInput,
  UpdateShopifyCustomerInfoInput,
} from "../tools/index.js";

// Local to this module now. find_customer is the only customer read the tool
// registry exposes, so these two shapes describe its branches rather than a
// contract anything outside this file depends on.
interface SearchShopifyCustomersInput {
  query: string;
  limit?: number;
}

interface GetShopifyCustomerInput {
  customer_id: string;
}
import {
  formatShopifyToolError,
  isAmbiguousShopifyMutationError,
  ShopifyRequestError,
  shopifyRestJson,
  type ShopifyContext,
} from "./client.js";
import {
  toolError,
  toolNotFound,
  toolOk,
  toolPolicyBlock,
  toolUnknown,
  type CustomerInfoReceiptFactsV1,
  type CustomerInfoReceiptFieldV1,
  type CustomerNoteReceiptFactsV1,
  type ReceiptV1,
  type ToolResult,
} from "../tools/result.js";
import { customerName, serializeCustomer } from "./serializers.js";
import { shopifyFailureReceipt, shopifyReceiptEnvelope } from "./receipts.js";
import type { ShopifyCustomer } from "./types.js";
import {
  clampLimit,
  optionalString,
  requireNonEmptyString,
  requireNumericId,
  ShopifyInputError,
} from "./validation.js";

// The one customer read the registry exposes. Both branches are the
// implementations the two retired tools already used, unchanged: consolidating
// the tool surface is not a reason to re-derive the Shopify calls underneath it.
export async function findCustomer(
  input: FindCustomerInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  return input.by === "id"
    ? getShopifyCustomer({ customer_id: input.value }, ctx)
    : searchShopifyCustomers({ query: input.value, limit: input.limit }, ctx);
}

async function searchShopifyCustomers(
  input: SearchShopifyCustomersInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const query = requireNonEmptyString(input.query, "query");
    const limit = clampLimit(input.limit, 5, 10);
    const data = await shopifyRestJson<{ customers?: ShopifyCustomer[] }>(ctx, "customers/search.json", {
      query: {
        query,
        limit,
        fields: "id,first_name,last_name,email,phone",
      },
    });

    const customers = data.customers ?? [];
    if (customers.length === 0) return toolNotFound(`No customers found matching "${query}".`);

    return toolOk(JSON.stringify(
      customers.map((customer) => ({
        customer_id: String(customer.id),
        name: customerName(customer),
        email: customer.email ?? null,
        phone: customer.phone ?? null,
      }))
    ));
  } catch (err) {
    return toolError(formatShopifyToolError("could not search customers", err));
  }
}

async function getShopifyCustomer(
  input: GetShopifyCustomerInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const customerId = requireNumericId(input.customer_id, "customer_id");
    const data = await shopifyRestJson<{ customer?: ShopifyCustomer }>(ctx, `customers/${customerId}.json`, {
      query: {
        fields: "id,first_name,last_name,email,phone,orders_count,total_spent,default_address,note",
      },
    });

    if (!data.customer) {
      return toolError(`Error: could not fetch customer - customer ${customerId} was not returned by Shopify.`);
    }

    return toolOk(JSON.stringify(serializeCustomer(data.customer)));
  } catch (err) {
    return toolError(formatShopifyToolError("could not fetch customer", err));
  }
}

const CUSTOMER_INFO_FIELDS = [
  ["firstName", "first_name"],
  ["lastName", "last_name"],
  ["email", "email"],
  ["phone", "phone"],
] as const satisfies ReadonlyArray<readonly [CustomerInfoReceiptFieldV1, keyof ShopifyCustomer]>;

export interface CustomerInfoUpdate {
  customerId: string;
  payload: Record<string, string>;
  expected: Partial<Record<CustomerInfoReceiptFieldV1, string>>;
}

export function buildCustomerInfoUpdate(input: UpdateShopifyCustomerInfoInput): CustomerInfoUpdate {
  const customerId = requireNumericId(input.customer_id, "customer_id");
  const payload: Record<string, string> = { id: customerId };
  const expected: Partial<Record<CustomerInfoReceiptFieldV1, string>> = {};
  for (const [receiptField, shopifyField] of CUSTOMER_INFO_FIELDS) {
    const value = optionalString(input[shopifyField]);
    if (value !== undefined) {
      payload[shopifyField] = value;
      expected[receiptField] = value;
    }
  }
  if (Object.keys(expected).length === 0) {
    throw new ShopifyInputError("provide at least one customer field to update.");
  }
  return { customerId, payload, expected };
}

function normalizedCustomerField(field: CustomerInfoReceiptFieldV1, value: unknown): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return field === "email" ? normalized.toLowerCase() : normalized;
}

export function customerInfoUpdates(
  customer: ShopifyCustomer | null | undefined,
  update: CustomerInfoUpdate,
): CustomerInfoReceiptFactsV1["updates"] | null {
  if (!customer || String(customer.id) !== update.customerId) return null;
  const observed: CustomerInfoReceiptFactsV1["updates"] = [];
  for (const [receiptField, shopifyField] of CUSTOMER_INFO_FIELDS) {
    const expected = update.expected[receiptField];
    if (expected === undefined) continue;
    const actual = normalizedCustomerField(receiptField, customer[shopifyField]);
    if (!actual || actual !== normalizedCustomerField(receiptField, expected)) return null;
    observed.push({ field: receiptField, value: actual });
  }
  return observed.length > 0 ? observed : null;
}

async function readCustomerInfo(ctx: ShopifyContext, customerId: string): Promise<ShopifyCustomer | null> {
  const data = await shopifyRestJson<{ customer?: ShopifyCustomer }>(ctx, `customers/${customerId}.json`, {
    query: { fields: "id,first_name,last_name,email,phone" },
    maxRetries: 1,
  });
  return data.customer ?? null;
}

function customerInfoFailure(
  ctx: ShopifyContext,
  customerId: string,
  result: ToolResult,
  outcome: "not_found" | "rejected" | "failed" | "unknown",
  code: string,
  providerReference: string | null = null,
): ToolResult {
  const receipt = shopifyFailureReceipt(
    ctx,
    { kind: "customer", id: customerId },
    "update_shopify_customer_info",
    outcome,
    code,
    providerReference,
  );
  return receipt ? { ...result, receipt } : result;
}

function customerInfoSuccess(
  ctx: ShopifyContext,
  customer: ShopifyCustomer,
  update: CustomerInfoUpdate,
  reconciled: boolean,
): ToolResult {
  const updates = customerInfoUpdates(customer, update);
  if (!updates) {
    return customerInfoFailure(
      ctx,
      update.customerId,
      toolUnknown(`Unknown: Shopify returned customer ${update.customerId}, but the requested profile fields could not be confirmed. Do not retry or confirm the update until it is reconciled.`),
      "unknown",
      "customer_update_not_confirmed",
      update.customerId,
    );
  }
  const confirmation = reconciled ? " (confirmed after an interrupted provider response)" : "";
  const result = toolOk(
    `Customer info updated${confirmation}. Name: ${customerName(customer)}, Email: ${customer.email ?? "none"}, Phone: ${customer.phone ?? "none"}.`,
  );
  const envelope = shopifyReceiptEnvelope(ctx, { kind: "customer", id: update.customerId });
  if (!envelope) return result;
  const receipt: ReceiptV1 = {
    ...envelope,
    tool: "update_shopify_customer_info",
    outcome: "succeeded",
    providerReference: update.customerId,
    facts: { customerId: update.customerId, updates },
  };
  return { ...result, receipt };
}

async function reconcileCustomerInfo(
  ctx: ShopifyContext,
  update: CustomerInfoUpdate,
  mutationError?: unknown,
): Promise<ToolResult> {
  try {
    const customer = await readCustomerInfo(ctx, update.customerId);
    if (customerInfoUpdates(customer, update)) {
      return customerInfoSuccess(ctx, customer!, update, true);
    }
    const detail = mutationError
      ? ` ${formatShopifyToolError("customer info reconciliation failed", mutationError)}`
      : "";
    return customerInfoFailure(
      ctx,
      update.customerId,
      toolUnknown(`Unknown: the customer-info update may have committed at Shopify, but a follow-up read did not confirm every requested field. Do not retry or confirm it until it is reconciled.${detail}`),
      "unknown",
      "customer_update_not_confirmed",
      update.customerId,
    );
  } catch (error) {
    return customerInfoFailure(
      ctx,
      update.customerId,
      toolUnknown(`Unknown: the customer-info update may have committed at Shopify and its follow-up read failed. Do not retry or confirm it until it is reconciled. ${formatShopifyToolError("customer info reconciliation failed", error)}`),
      "unknown",
      "customer_update_reconciliation_failed",
      update.customerId,
    );
  }
}

export async function updateShopifyCustomerInfo(
  input: UpdateShopifyCustomerInfoInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  let mutationStarted = false;
  let update: CustomerInfoUpdate | null = null;
  try {
    update = buildCustomerInfoUpdate(input);
    mutationStarted = true;
    const data = await shopifyRestJson<{ customer?: ShopifyCustomer }>(
      ctx,
      `customers/${update.customerId}.json`,
      { method: "PUT", body: { customer: update.payload } },
    );
    return data.customer && customerInfoUpdates(data.customer, update)
      ? customerInfoSuccess(ctx, data.customer, update, false)
      : reconcileCustomerInfo(ctx, update);
  } catch (err) {
    const customerId = update?.customerId ?? String(input.customer_id ?? "invalid");
    if (mutationStarted && update && isAmbiguousShopifyMutationError(err)) {
      return reconcileCustomerInfo(ctx, update, err);
    }
    if (err instanceof ShopifyInputError) {
      return customerInfoFailure(
        ctx,
        customerId,
        toolPolicyBlock(formatShopifyToolError("failed to update customer info", err)),
        "rejected",
        "invalid_customer_update_input",
      );
    }
    if (err instanceof ShopifyRequestError && err.status === 404) {
      return customerInfoFailure(
        ctx,
        customerId,
        toolNotFound(formatShopifyToolError("failed to update customer info", err)),
        "not_found",
        "customer_not_found",
      );
    }
    return customerInfoFailure(
      ctx,
      customerId,
      toolError(formatShopifyToolError("failed to update customer info", err)),
      "failed",
      mutationStarted ? "provider_rejected_customer_update" : "pre_dispatch_failure",
    );
  }
}

export async function addShopifyCustomerNote(
  input: AddShopifyCustomerNoteInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  let mutationStarted = false;
  let customerId = String(input.customer_id ?? "invalid");
  let note = "";
  let previousNote = "";
  let resultingNote = "";
  try {
    customerId = requireNumericId(input.customer_id, "customer_id");
    note = requireNonEmptyString(input.note, "note");

    const existing = await shopifyRestJson<{ customer?: Pick<ShopifyCustomer, "id" | "note"> }>(
      ctx,
      `customers/${customerId}.json`,
      { query: { fields: "id,note" } }
    );

    if (!existing.customer) {
      return customerNoteFailure(
        ctx,
        customerId,
        toolNotFound(`Error: failed to add note - customer ${customerId} was not returned by Shopify.`),
        "not_found",
        "customer_not_found",
      );
    }

    previousNote = existing.customer.note ?? "";
    resultingNote = previousNote ? `${previousNote}\n\n${note}` : note;

    mutationStarted = true;
    const data = await shopifyRestJson<{ customer?: ShopifyCustomer }>(ctx, `customers/${customerId}.json`, {
      method: "PUT",
      body: { customer: { id: customerId, note: resultingNote } },
    });

    if (customerNoteMatches(data.customer, customerId, resultingNote)) {
      return customerNoteSuccess(ctx, customerId, note, previousNote, resultingNote, false);
    }
    return reconcileCustomerNote(ctx, customerId, note, previousNote, resultingNote);
  } catch (err) {
    if (mutationStarted && isAmbiguousShopifyMutationError(err)) {
      return reconcileCustomerNote(ctx, customerId, note, previousNote, resultingNote, err);
    }
    if (err instanceof ShopifyInputError) {
      return customerNoteFailure(
        ctx,
        customerId,
        toolPolicyBlock(formatShopifyToolError("failed to add note", err)),
        "rejected",
        "invalid_customer_note_input",
      );
    }
    if (err instanceof ShopifyRequestError && err.status === 404) {
      return customerNoteFailure(
        ctx,
        customerId,
        toolNotFound(formatShopifyToolError("failed to add note", err)),
        "not_found",
        "customer_not_found",
      );
    }
    return customerNoteFailure(
      ctx,
      customerId,
      toolError(formatShopifyToolError("failed to add note", err)),
      "failed",
      mutationStarted ? "provider_rejected_customer_note" : "pre_dispatch_failure",
    );
  }
}

function noteSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function customerNoteMatches(
  customer: Pick<ShopifyCustomer, "id" | "note"> | null | undefined,
  customerId: string,
  expectedNote: string,
): boolean {
  return Boolean(customer && String(customer.id) === customerId && customer.note === expectedNote);
}

function customerNoteFailure(
  ctx: ShopifyContext,
  customerId: string,
  result: ToolResult,
  outcome: "not_found" | "rejected" | "failed" | "unknown",
  code: string,
  providerReference: string | null = null,
): ToolResult {
  const receipt = shopifyFailureReceipt(
    ctx,
    { kind: "customer", id: customerId },
    "add_shopify_customer_note",
    outcome,
    code,
    providerReference,
  );
  return receipt ? { ...result, receipt } : result;
}

function customerNoteSuccess(
  ctx: ShopifyContext,
  customerId: string,
  appendedNote: string,
  oldNote: string,
  newNote: string,
  reconciled: boolean,
): ToolResult {
  const confirmation = reconciled ? " (confirmed after an interrupted provider response)" : "";
  const result = toolOk(`Note added to Shopify customer record${confirmation}: "${appendedNote}"`);
  const envelope = shopifyReceiptEnvelope(ctx, { kind: "customer", id: customerId });
  if (!envelope) return result;
  const facts: CustomerNoteReceiptFactsV1 = {
    customerId,
    previousNoteSha256: noteSha256(oldNote),
    appendedNoteSha256: noteSha256(appendedNote),
    resultingNoteSha256: noteSha256(newNote),
    resultingNoteLength: newNote.length,
    appendState: "appended",
  };
  const receipt: ReceiptV1 = {
    ...envelope,
    tool: "add_shopify_customer_note",
    outcome: "succeeded",
    providerReference: customerId,
    facts,
  };
  return { ...result, receipt };
}

async function reconcileCustomerNote(
  ctx: ShopifyContext,
  customerId: string,
  appendedNote: string,
  oldNote: string,
  newNote: string,
  mutationError?: unknown,
): Promise<ToolResult> {
  try {
    const data = await shopifyRestJson<{ customer?: Pick<ShopifyCustomer, "id" | "note"> }>(
      ctx,
      `customers/${customerId}.json`,
      { query: { fields: "id,note" }, maxRetries: 1 },
    );
    if (customerNoteMatches(data.customer, customerId, newNote)) {
      return customerNoteSuccess(ctx, customerId, appendedNote, oldNote, newNote, true);
    }
    const detail = mutationError
      ? ` ${formatShopifyToolError("customer note reconciliation failed", mutationError)}`
      : "";
    return customerNoteFailure(
      ctx,
      customerId,
      toolUnknown(`Unknown: the customer-note append may have committed at Shopify, but a follow-up read did not confirm the exact resulting note. Do not retry or confirm it until it is reconciled.${detail}`),
      "unknown",
      "customer_note_not_confirmed",
      customerId,
    );
  } catch (error) {
    return customerNoteFailure(
      ctx,
      customerId,
      toolUnknown(`Unknown: the customer-note append may have committed at Shopify and its follow-up read failed. Do not retry or confirm it until it is reconciled. ${formatShopifyToolError("customer note reconciliation failed", error)}`),
      "unknown",
      "customer_note_reconciliation_failed",
      customerId,
    );
  }
}
