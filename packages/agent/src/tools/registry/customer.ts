import { noShopify, requireShopify } from "./helpers.js";
import { defineTool, numberArg, stringArg } from "./schema.js";
import type {
  AddShopifyCustomerNoteInput,
  GetShopifyCustomerInput,
  SearchShopifyCustomersInput,
  UpdateShopifyCustomerInfoInput,
} from "./types.js";

export const CUSTOMER_TOOL_DEFINITIONS = [
  defineTool({
    name: "search_shopify_customers",
    description:
      "Search for Shopify customers by name or email. Use this when given a customer's name or email address to resolve their Shopify customer ID before calling other customer tools.",
    fields: {
      query: stringArg("Name or email to search for (e.g. 'Jane Smith' or 'jane@example.com').", { required: true }),
      limit: numberArg("Maximum number of results to return (default 5, max 10)."),
    },
    category: "read",
    group: "customer",
    label: "Searched customers",
    planStepLabel: "Search Shopify customers",
    execute: async (input: SearchShopifyCustomersInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.searchShopifyCustomers(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "get_shopify_customer",
    description:
      "Fetch the Shopify customer profile (name, email, phone, address, order count, total spent). Call this first whenever you need customer details.",
    fields: {
      customer_id: stringArg("The Shopify customer ID (already available in context if the thread is linked).", { required: true }),
    },
    category: "read",
    group: "customer",
    label: "Fetched customer",
    planStepLabel: "Fetch customer profile",
    execute: async (input: GetShopifyCustomerInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.getShopifyCustomer(input, shopify) : noShopify;
    },
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
    label: "Added Shopify note",
    planStepLabel: "Add note to Shopify customer",
    execute: async (input: AddShopifyCustomerNoteInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.addShopifyCustomerNote(input, shopify) : noShopify;
    },
  }),
] as const;
