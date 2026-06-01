import type {
  AddShopifyCustomerNoteInput,
  GetShopifyCustomerInput,
  SearchShopifyCustomersInput,
  UpdateShopifyCustomerInfoInput,
} from "../tools";
import { formatShopifyToolError, shopifyRestJson, type ShopifyContext } from "./client";
import { toolError, toolNotFound, toolOk, type ToolResult } from "../tools/result";
import { customerName, serializeCustomer } from "./serializers";
import type { ShopifyCustomer } from "./types";
import { clampLimit, optionalString, requireNonEmptyString, requireNumericId } from "./validation";

export async function searchShopifyCustomers(
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

export async function getShopifyCustomer(
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

export async function updateShopifyCustomerInfo(
  input: UpdateShopifyCustomerInfoInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const customerId = requireNumericId(input.customer_id, "customer_id");
    const payload: Record<string, string> = { id: customerId };

    const firstName = optionalString(input.first_name);
    const lastName = optionalString(input.last_name);
    const email = optionalString(input.email);
    const phone = optionalString(input.phone);

    if (firstName !== undefined) payload.first_name = firstName;
    if (lastName !== undefined) payload.last_name = lastName;
    if (email !== undefined) payload.email = email;
    if (phone !== undefined) payload.phone = phone;

    if (Object.keys(payload).length === 1) {
      return toolError("Error: failed to update customer info - provide at least one customer field to update.");
    }

    const data = await shopifyRestJson<{ customer?: ShopifyCustomer }>(ctx, `customers/${customerId}.json`, {
      method: "PUT",
      body: { customer: payload },
    });

    if (!data.customer) {
      return toolError(`Error: failed to update customer info - customer ${customerId} was not returned by Shopify.`);
    }

    const c = data.customer;
    return toolOk(`Customer info updated. Name: ${customerName(c)}, Email: ${c.email ?? "none"}, Phone: ${c.phone ?? "none"}.`);
  } catch (err) {
    return toolError(formatShopifyToolError("failed to update customer info", err));
  }
}

export async function addShopifyCustomerNote(
  input: AddShopifyCustomerNoteInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const customerId = requireNumericId(input.customer_id, "customer_id");
    const note = requireNonEmptyString(input.note, "note");

    const existing = await shopifyRestJson<{ customer?: Pick<ShopifyCustomer, "id" | "note"> }>(
      ctx,
      `customers/${customerId}.json`,
      { query: { fields: "id,note" } }
    );

    if (!existing.customer) {
      return toolError(`Error: failed to add note - customer ${customerId} was not returned by Shopify.`);
    }

    const existingNote = existing.customer.note ?? "";
    const newNote = existingNote ? `${existingNote}\n\n${note}` : note;

    const data = await shopifyRestJson<{ customer?: ShopifyCustomer }>(ctx, `customers/${customerId}.json`, {
      method: "PUT",
      body: { customer: { id: customerId, note: newNote } },
    });

    if (!data.customer) {
      return toolError(`Error: failed to add note - customer ${customerId} was not returned after update.`);
    }

    return toolOk(`Note added to Shopify customer record: "${note}"`);
  } catch (err) {
    return toolError(formatShopifyToolError("failed to add note", err));
  }
}
