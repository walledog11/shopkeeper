import type Anthropic from "@anthropic-ai/sdk";

// Tool definitions in Anthropic tool-use format.
export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_kb",
    description:
      "Search the organization's knowledge base for articles matching a query. Use this to find store policies, FAQs, or how-to guides before answering customer questions about returns, shipping, or store procedures.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search terms to look for in knowledge base article titles and bodies (e.g. 'return policy', 'shipping times').",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_shopify_products",
    description:
      "Search the Shopify product catalog by title or keyword. Returns matching products with their variants and variant IDs. Use this when the operator describes a product by name (e.g. 'pencil half zip, size L') so you can resolve the correct variant_id before creating an order.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Product title or keyword to search for (e.g. 'pencil half zip').",
        },
        limit: {
          type: "number",
          description: "Maximum number of products to return (default 5, max 10).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_shopify_customers",
    description:
      "Search for Shopify customers by name or email. Use this when given a customer's name or email address to resolve their Shopify customer ID before calling other customer tools.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Name or email to search for (e.g. 'Jane Smith' or 'jane@example.com').",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default 5, max 10).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_shopify_customer",
    description:
      "Fetch the Shopify customer profile (name, email, phone, address, order count, total spent). Call this first whenever you need customer details.",
    input_schema: {
      type: "object",
      properties: {
        customer_id: {
          type: "string",
          description: "The Shopify customer ID (already available in context if the thread is linked).",
        },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "update_shopify_customer_info",
    description:
      "Update basic Shopify customer info: first name, last name, email, or phone.",
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "Shopify customer ID." },
        first_name:  { type: "string", description: "First name." },
        last_name:   { type: "string", description: "Last name." },
        email:       { type: "string", description: "Email address." },
        phone:       { type: "string", description: "Phone number." },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "get_shopify_orders",
    description: "Fetch the most recent Shopify orders for a customer (up to 5), including financial status, fulfillment status, line items, and the order's shipping_address (address1, address2, city, province, zip, country). Use this first for basic order-status questions or to look up the shipping address; if fulfillment_status is null, the order has not shipped yet and you usually do not need get_order_tracking.",
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "Shopify customer ID." },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "update_shopify_order_address",
    description:
      "Update the shipping address on a specific Shopify order AND sync the customer's default address to match (only works for unfulfilled/unshipped orders). The order ID is available in the 'Customer's recent orders' context , use it directly. Pass ALL address components in a single call.",
    input_schema: {
      type: "object",
      properties: {
        order_id:    { type: "string", description: "Shopify order ID (numeric, e.g. '5678901234'). Use the id field from the orders context." },
        customer_id: { type: "string", description: "Shopify customer ID." },
        address1:    { type: "string", description: "Street line (e.g. '123 Main St')." },
        address2:    { type: "string", description: "Apartment, suite, unit, etc. (e.g. 'Apt 4B'). Omit if not provided." },
        city:        { type: "string", description: "City." },
        province:    { type: "string", description: "State or province abbreviation (e.g. 'NY', 'CA')." },
        zip:         { type: "string", description: "ZIP or postal code." },
        country:     { type: "string", description: "Country name (e.g. 'United States')." },
      },
      required: ["order_id", "customer_id", "address1", "city", "province", "zip", "country"],
    },
  },
  {
    name: "add_shopify_customer_note",
    description: "Append a note to the Shopify customer record (visible in the Shopify admin).",
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "Shopify customer ID." },
        note: { type: "string", description: "The note text to append." },
      },
      required: ["customer_id", "note"],
    },
  },
  {
    name: "get_order_by_name",
    description:
      "Look up a Shopify order by its human-readable order number (e.g. '#1234'). Use this when the customer mentions an order number. Returns the order ID, financial/fulfillment status, line items, and shipping_address.",
    input_schema: {
      type: "object",
      properties: {
        order_name: {
          type: "string",
          description: "The order number as shown to the customer, e.g. '#1234' or '1234'.",
        },
      },
      required: ["order_name"],
    },
  },
  {
    name: "get_order_tracking",
    description:
      "Fetch live fulfillment and tracking details for a Shopify order. Returns tracking number, carrier, shipment status, estimated delivery date, and the full scan event timeline (including exceptions like return to sender, delivery attempt failed, weather delay, etc.). Use this only when an order is already fulfilled or partially fulfilled, or when someone explicitly needs tracking details such as tracking numbers, carrier scans, delivery events, or delivery exceptions. Do not use it for unfulfilled orders or basic status checks that can be answered from get_shopify_orders.",
    input_schema: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "Shopify order ID (numeric, e.g. '5678901234'). Use the id field from the orders context or from get_order_by_name.",
        },
      },
      required: ["order_id"],
    },
  },
  {
    name: "create_refund",
    description:
      "Issue a refund on a Shopify order. Always pass an explicit amount (for a full refund, use the order's total from the orders context) so the refund can be validated against the workspace refund limit.",
    input_schema: {
      type: "object",
      properties: {
        order_id:  { type: "string", description: "Shopify order ID (numeric)." },
        amount:    { type: "string", description: "Amount to refund in the store's currency (e.g. '19.99'). For a full refund, use the order's total from context. Always provide this." },
        reason:    { type: "string", description: "Reason for the refund (e.g. 'Item not received', 'Wrong item sent')." },
      },
      required: ["order_id"],
    },
  },
  {
    name: "cancel_order",
    description:
      "Cancel an unfulfilled Shopify order. Only works for orders that have not yet been fulfilled.",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Shopify order ID (numeric)." },
        reason:   {
          type: "string",
          enum: ["customer", "fraud", "inventory", "declined", "other"],
          description: "Reason for cancellation.",
        },
        restock:  { type: "boolean", description: "Whether to restock the items. Defaults to true." },
      },
      required: ["order_id"],
    },
  },
  {
    name: "create_shopify_order",
    description:
      "Create a new Shopify order on behalf of a customer. Each line item must include either a variant_id (for a real catalog product) or a title + price (for a custom item, if allowed). Set financial_status to pending , do not charge the customer.",
    input_schema: {
      type: "object",
      properties: {
        email:      { type: "string",  description: "Customer email address." },
        first_name: { type: "string",  description: "Customer first name." },
        last_name:  { type: "string",  description: "Customer last name." },
        address1:   { type: "string",  description: "Shipping street address." },
        address2:   { type: "string",  description: "Apartment or suite (optional)." },
        city:       { type: "string",  description: "City." },
        province:   { type: "string",  description: "State or province abbreviation (e.g. 'NY')." },
        zip:        { type: "string",  description: "ZIP or postal code." },
        country:    { type: "string",  description: "Country name (e.g. 'United States')." },
        line_items: {
          type: "array",
          description: "Items to include in the order.",
          items: {
            type: "object",
            properties: {
              variant_id: { type: "string", description: "Shopify product variant ID. Use this for real catalog products." },
              title:      { type: "string", description: "Custom item title. Only provide when variant_id is omitted." },
              price:      { type: "string", description: "Unit price as a decimal string (e.g. '29.99'). Only for custom items." },
              quantity:   { type: "number", description: "Quantity." },
            },
            required: ["quantity"],
          },
        },
        note: { type: "string", description: "Optional note to attach to the order." },
      },
      required: ["email", "first_name", "last_name", "address1", "city", "province", "zip", "country", "line_items"],
    },
  },
  {
    name: "edit_shopify_order",
    description:
      "Add, remove, or swap a line item on an existing Shopify order using the Order Editing API. To add an item: provide variant_id and quantity. To remove an item: provide only remove_variant_id from the orders context, no search needed. To swap size/color: provide variant_id (new) and remove_variant_id (old). At least one of variant_id or remove_variant_id must be provided.",
    input_schema: {
      type: "object",
      properties: {
        order_id:          { type: "string", description: "Shopify order ID (numeric, e.g. '5678901234'). Use the id field from the orders context." },
        variant_id:        { type: "string", description: "Variant ID to add. Required when adding or swapping. Omit for pure removal." },
        quantity:          { type: "number", description: "Number of units to add. Required when variant_id is provided." },
        remove_variant_id: { type: "string", description: "Variant ID of the existing item to remove. Use for removals and swaps. Available in the orders context , no search needed." },
      },
      required: ["order_id"],
    },
  },
  {
    name: "add_internal_note",
    description:
      "Add an internal note to the support thread. Notes are visible only to agents, not the customer. Always call this to document what you did.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Note content." },
      },
      required: ["text"],
    },
  },
  {
    name: "send_email",
    description:
      "Send an outbound email to any email address. Use this to proactively contact a customer (e.g. shipping delay notice) even when the current thread is not an email thread.",
    input_schema: {
      type: "object",
      properties: {
        to:      { type: "string", description: "Recipient email address in user@domain format (e.g. 'jane@example.com'). Must be a valid SMTP address , never a name or phone number." },
        subject: { type: "string", description: "Email subject line." },
        body:    { type: "string", description: "Email body text." },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "send_reply",
    description:
      "Send a message to the customer on their channel (Instagram DM, email, etc.).",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The message text to send." },
      },
      required: ["text"],
    },
  },
  {
    name: "update_thread_status",
    description: "Update the status of the support thread.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["open", "pending", "closed"],
          description: "New status for the thread.",
        },
      },
      required: ["status"],
    },
  },
  {
    name: "update_thread_tag",
    description: "Update the topic tag on the support thread.",
    input_schema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "New tag (e.g. 'Shipping', 'Returns', 'Billing')." },
      },
      required: ["tag"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand off the ticket to the merchant when a tool failure, missing data, or out-of-scope question prevents you from helping. Marks the thread as pending with a 'needs_human' tag and logs the reason. Stop after calling this , do not attempt any other tools or send a reply.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "A short explanation of why a human needs to take over (e.g. 'Customer is asking about wholesale pricing , out of scope', 'Shopify returned 503 on refund attempt').",
        },
      },
      required: ["reason"],
    },
  },
];
