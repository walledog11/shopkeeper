import type { ChatCompletionTool } from "openai/resources/chat/completions";

// ── Tool definitions (OpenAI function-calling format) ─────────────────────────

export const AGENT_TOOLS: ChatCompletionTool[] = [
  // ── Shopify ──────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_shopify_customer",
      description:
        "Fetch the Shopify customer profile (name, email, phone, address, order count, total spent). Call this first whenever you need customer details.",
      parameters: {
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
  },
  {
    type: "function",
    function: {
      name: "update_shopify_customer_info",
      description:
        "Update basic Shopify customer info: first name, last name, email, or phone.",
      parameters: {
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
  },
  {
    type: "function",
    function: {
      name: "get_shopify_orders",
      description: "Fetch the most recent Shopify orders for a customer (up to 5).",
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Shopify customer ID." },
        },
        required: ["customer_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_shopify_order_address",
      description:
        "Update the shipping address on a specific Shopify order AND sync the customer's default address to match (only works for unfulfilled/unshipped orders). Call get_shopify_orders first to find the order ID, then call this with the full address. Pass ALL address components in a single call.",
      parameters: {
        type: "object",
        properties: {
          order_id:    { type: "string", description: "Shopify order ID (numeric, e.g. '5678901234')." },
          customer_id: { type: "string", description: "Shopify customer ID." },
          address1:    { type: "string", description: "Street line (e.g. '123 Main St')." },
          city:        { type: "string", description: "City." },
          province:    { type: "string", description: "State or province abbreviation (e.g. 'NY', 'CA')." },
          zip:         { type: "string", description: "ZIP or postal code." },
          country:     { type: "string", description: "Country name (e.g. 'United States')." },
        },
        required: ["order_id", "customer_id", "address1", "city", "province", "zip", "country"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_shopify_customer_note",
      description: "Append a note to the Shopify customer record (visible in the Shopify admin).",
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Shopify customer ID." },
          note: { type: "string", description: "The note text to append." },
        },
        required: ["customer_id", "note"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "get_order_by_name",
      description:
        "Look up a Shopify order by its human-readable order number (e.g. '#1234'). Use this when the customer mentions an order number. Returns the order ID and details.",
      parameters: {
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
  },
  {
    type: "function",
    function: {
      name: "create_refund",
      description:
        "Issue a full or partial refund on a Shopify order. If amount is omitted, issues a full refund of the order total.",
      parameters: {
        type: "object",
        properties: {
          order_id:  { type: "string", description: "Shopify order ID (numeric)." },
          amount:    { type: "string", description: "Amount to refund in the store's currency (e.g. '19.99'). Omit for a full refund." },
          reason:    { type: "string", description: "Reason for the refund (e.g. 'Item not received', 'Wrong item sent')." },
        },
        required: ["order_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_order",
      description:
        "Cancel an unfulfilled Shopify order. Only works for orders that have not yet been fulfilled.",
      parameters: {
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
  },

  // ── Thread / DB ───────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "add_internal_note",
      description:
        "Add an internal note to the support thread. Notes are visible only to agents, not the customer. Always call this to document what you did.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Note content." },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_reply",
      description:
        "Send a message to the customer on their channel (Instagram DM, email, etc.).",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "The message text to send." },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_thread_status",
      description: "Update the status of the support thread.",
      parameters: {
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
  },
  {
    type: "function",
    function: {
      name: "update_thread_tag",
      description: "Update the topic tag on the support thread.",
      parameters: {
        type: "object",
        properties: {
          tag: { type: "string", description: "New tag (e.g. 'Shipping', 'Returns', 'Billing')." },
        },
        required: ["tag"],
      },
    },
  },
];

// ── Input types (mirrors the parameter schemas above) ─────────────────────────

export interface GetShopifyCustomerInput {
  customer_id: string;
}

export interface UpdateShopifyCustomerInfoInput {
  customer_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

export interface GetShopifyOrdersInput {
  customer_id: string;
}

export interface UpdateShopifyOrderAddressInput {
  order_id: string;
  customer_id: string;
  address1: string;
  city: string;
  province: string;
  zip: string;
  country: string;
}

export interface AddShopifyCustomerNoteInput {
  customer_id: string;
  note: string;
}

export interface GetOrderByNameInput {
  order_name: string;
}

export interface CreateRefundInput {
  order_id: string;
  amount?: string;
  reason?: string;
}

export interface CancelOrderInput {
  order_id: string;
  reason?: "customer" | "fraud" | "inventory" | "declined" | "other";
  restock?: boolean;
}

export interface AddInternalNoteInput {
  text: string;
}

export interface SendReplyInput {
  text: string;
}

export interface UpdateThreadStatusInput {
  status: "open" | "pending" | "closed";
}

export interface UpdateThreadTagInput {
  tag: string;
}

