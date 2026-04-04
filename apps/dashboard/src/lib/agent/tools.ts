import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { ToolCategory } from "@/types";

// ── Shared prefix used to tag agent turn notes in the DB ─────────────────────
export const AGENT_TURN_PREFIX = "__clerk_agent__";

// ── Tool category map — used for plan filtering and UI display ────────────────
export const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  search_shopify_products:      'read',
  search_shopify_customers:     'read',
  get_shopify_customer:         'read',
  update_shopify_customer_info: 'action',
  get_shopify_orders:           'read',
  update_shopify_order_address: 'action',
  add_shopify_customer_note:    'action',
  get_order_by_name:            'read',
  create_refund:                'action',
  cancel_order:                 'action',
  create_shopify_order:         'action',
  add_internal_note:            'internal',
  send_reply:                   'communication',
  send_email:                   'communication',
  update_thread_status:         'internal',
  update_thread_tag:            'internal',
}

// ── Human-readable labels for executed tool calls (past tense) ───────────────
export const TOOL_LABELS: Record<string, string> = {
  search_shopify_products:      'Searched products',
  search_shopify_customers:     'Searched customers',
  get_shopify_customer:         'Fetched customer',
  update_shopify_customer_info: 'Updated customer info',
  get_shopify_orders:           'Fetched orders',
  update_shopify_order_address: 'Updated shipping address',
  add_shopify_customer_note:    'Added Shopify note',
  get_order_by_name:            'Looked up order',
  create_refund:                'Issued refund',
  cancel_order:                 'Cancelled order',
  create_shopify_order:         'Created order',
  add_internal_note:            'Added internal note',
  send_reply:                   'Sent reply',
  send_email:                   'Sent email',
  update_thread_status:         'Updated thread status',
  update_thread_tag:            'Updated thread tag',
}

// ── Human-readable labels for plan steps ─────────────────────────────────────
export const PLAN_STEP_LABELS: Record<string, string> = {
  search_shopify_products:      'Search Shopify products',
  search_shopify_customers:     'Search Shopify customers',
  get_shopify_customer:         'Fetch customer profile',
  update_shopify_customer_info: 'Update customer info on Shopify',
  get_shopify_orders:           'Fetch recent orders',
  update_shopify_order_address: 'Update shipping address on Shopify',
  add_shopify_customer_note:    'Add note to Shopify customer',
  get_order_by_name:            'Look up order',
  create_refund:                'Issue refund',
  cancel_order:                 'Cancel order',
  create_shopify_order:         'Create Shopify order',
  add_internal_note:            'Add internal note',
  send_reply:                   'Notify customer',
  send_email:                   'Send email to customer',
  update_thread_status:         'Update ticket status',
  update_thread_tag:            'Update ticket tag',
}

// ── Tool definitions (OpenAI function-calling format) ─────────────────────────

export const AGENT_TOOLS: ChatCompletionTool[] = [
  // ── Shopify ──────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "search_shopify_products",
      description:
        "Search the Shopify product catalog by title or keyword. Returns matching products with their variants and variant IDs. Use this when the operator describes a product by name (e.g. 'pencil half zip, size L') so you can resolve the correct variant_id before creating an order.",
      parameters: {
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
  },
  {
    type: "function",
    function: {
      name: "search_shopify_customers",
      description:
        "Search for Shopify customers by name or email. Use this when given a customer's name or email address to resolve their Shopify customer ID before calling other customer tools.",
      parameters: {
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
  },
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
        "Update the shipping address on a specific Shopify order AND sync the customer's default address to match (only works for unfulfilled/unshipped orders). The order ID is available in the 'Customer's recent orders' context — use it directly. Pass ALL address components in a single call.",
      parameters: {
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

  {
    type: "function",
    function: {
      name: "create_shopify_order",
      description:
        "Create a new Shopify order on behalf of a customer. Each line item must include either a variant_id (for a real catalog product) or a title + price (for a custom item, if allowed). Set financial_status to pending — do not charge the customer.",
      parameters: {
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
      name: "send_email",
      description:
        "Send an outbound email to any email address. Use this to proactively contact a customer (e.g. shipping delay notice) even when the current thread is not an email thread.",
      parameters: {
        type: "object",
        properties: {
          to:      { type: "string", description: "Recipient email address in user@domain format (e.g. 'jane@example.com'). Must be a valid SMTP address — never a name or phone number." },
          subject: { type: "string", description: "Email subject line." },
          body:    { type: "string", description: "Email body text." },
        },
        required: ["to", "subject", "body"],
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

export interface SearchShopifyProductsInput {
  query: string;
  limit?: number;
}

export interface SearchShopifyCustomersInput {
  query: string;
  limit?: number;
}

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
  address2?: string;
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

export interface CreateShopifyOrderLineItem {
  variant_id?: string;
  title?: string;
  price?: string;
  quantity: number;
}

export interface CreateShopifyOrderInput {
  email: string;
  first_name: string;
  last_name: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  zip: string;
  country: string;
  line_items: CreateShopifyOrderLineItem[];
  note?: string;
}

export interface AddInternalNoteInput {
  text: string;
}

export interface SendReplyInput {
  text: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
}

export interface UpdateThreadStatusInput {
  status: "open" | "pending" | "closed";
}

export interface UpdateThreadTagInput {
  tag: string;
}

