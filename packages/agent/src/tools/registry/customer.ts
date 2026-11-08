import { noShopify, requireShopify } from "./helpers.js";
import { defineTool } from "./schema.js";
import { TOOL_INPUT_FIELDS } from "./input-fields.js";
import { toolPolicyBlock } from "../result.js";

export const CUSTOMER_TOOL_DEFINITIONS = [
  defineTool({
    name: "find_customer",
    description:
      "Look up a Shopify customer, by whichever handle you have. Set by='query' with a name or email to resolve someone you can only name — it returns the matching customers with their IDs, so use it when no customer ID is in context. Set by='id' with a known Shopify customer ID to fetch that customer's full profile: name, email, phone, default address, order count, and total spent.",
    fields: TOOL_INPUT_FIELDS.find_customer,
    category: "read",
    group: "customer",
    capabilities: ["shopify"],
    label: "Looked up customer",
    planStepLabel: "Look up customer",
    execute: async (input, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.findCustomer(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "search_shopify_customers",
    description:
      "Retired customer search. Kept only so old action records stay readable; use find_customer with by='query'.",
    fields: TOOL_INPUT_FIELDS.search_shopify_customers,
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
    fields: TOOL_INPUT_FIELDS.get_shopify_customer,
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
    fields: TOOL_INPUT_FIELDS.update_shopify_customer_info,
    category: "action",
    group: "customer",
    capabilities: ["shopify"],
    requiredScopes: ["write_customers"],
    requiredReceiptVersion: 1,
    label: "Updated customer info",
    planStepLabel: "Update customer info on Shopify",
    execute: async (input, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.updateShopifyCustomerInfo(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "add_shopify_customer_note",
    description: "Append a note to the Shopify customer record (visible in the Shopify admin).",
    fields: TOOL_INPUT_FIELDS.add_shopify_customer_note,
    category: "action",
    group: "customer",
    capabilities: ["shopify"],
    requiredScopes: ["write_customers"],
    requiredReceiptVersion: 1,
    label: "Added Shopify note",
    planStepLabel: "Add note to Shopify customer",
    execute: async (input, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.addShopifyCustomerNote(input, shopify) : noShopify;
    },
  }),
] as const;
