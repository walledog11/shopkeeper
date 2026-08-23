import { noShopify, requireShopify } from "./helpers.js";
import { defineTool, numberArg, stringArg } from "./schema.js";
import { toolPolicyBlock } from "../result.js";
import type {
  AddShopifyCustomerNoteInput,
  FindCustomerInput,
  UpdateShopifyCustomerInfoInput,
} from "./types.js";

export const CUSTOMER_TOOL_DEFINITIONS = [
  defineTool({
    name: "find_customer",
    description:
      "Look up a Shopify customer, by whichever handle you have. Set by='query' with a name or email to resolve someone you can only name — it returns the matching customers with their IDs, so use it when no customer ID is in context. Set by='id' with a known Shopify customer ID to fetch that customer's full profile: name, email, phone, default address, order count, and total spent.",
    fields: {
      by: stringArg(
        "How you are identifying the customer: 'query' for a name or email, 'id' for a Shopify customer ID.",
        { required: true, enum: ["query", "id"] },
      ),
      value: stringArg(
        "The name or email when by='query' (e.g. 'Jane Smith' or 'jane@example.com'), or the Shopify customer ID when by='id'.",
        { required: true },
      ),
      limit: numberArg("Maximum matches to return for by='query' (default 5, max 10). Ignored for by='id'."),
    },
    category: "read",
    group: "customer",
    capabilities: ["shopify"],
    label: "Looked up customer",
    planStepLabel: "Look up customer",
    execute: async (input: FindCustomerInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.findCustomer(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "search_shopify_customers",
    description:
      "Retired customer search. Kept only so old action records stay readable; use find_customer with by='query'.",
    fields: {
      query: stringArg("Name or email to search for (e.g. 'Jane Smith' or 'jane@example.com').", { required: true }),
      limit: numberArg("Maximum number of results to return (default 5, max 10)."),
    },
    category: "read",
    group: "customer",
    capabilities: ["shopify"],
    availability: "retired",
    label: "Searched customers",
    planStepLabel: "Search Shopify customers",
    execute: async () => toolPolicyBlock(
      "Error: search_shopify_customers is retired. Call find_customer with by='query'.",
    ),
  }),
  defineTool({
    name: "get_shopify_customer",
    description:
      "Retired customer profile read. Kept only so old action records stay readable; use find_customer with by='id'.",
    fields: {
      customer_id: stringArg("The Shopify customer ID (already available in context if the thread is linked).", { required: true }),
    },
    category: "read",
    group: "customer",
    capabilities: ["shopify"],
    availability: "retired",
    label: "Fetched customer",
    planStepLabel: "Fetch customer profile",
    execute: async () => toolPolicyBlock(
      "Error: get_shopify_customer is retired. Call find_customer with by='id'.",
    ),
  }),
  defineTool({
    name: "update_shopify_customer_info",
    description:
      "Update basic Shopify customer info: first name, last name, email, or phone.",
    fields: {
      customer_id: stringArg("Shopify customer ID.", { required: true }),
      first_name: stringArg("First name."),
      last_name: stringArg("Last name."),
      email: stringArg("Email address."),
      phone: stringArg("Phone number."),
    },
    category: "action",
    group: "customer",
    capabilities: ["shopify"],
    label: "Updated customer info",
    planStepLabel: "Update customer info on Shopify",
    execute: async (input: UpdateShopifyCustomerInfoInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.updateShopifyCustomerInfo(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "add_shopify_customer_note",
    description: "Append a note to the Shopify customer record (visible in the Shopify admin).",
    fields: {
      customer_id: stringArg("Shopify customer ID.", { required: true }),
      note: stringArg("The note text to append.", { required: true }),
    },
    category: "action",
    group: "customer",
    capabilities: ["shopify"],
    label: "Added Shopify note",
    planStepLabel: "Add note to Shopify customer",
    execute: async (input: AddShopifyCustomerNoteInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.addShopifyCustomerNote(input, shopify) : noShopify;
    },
  }),
] as const;
