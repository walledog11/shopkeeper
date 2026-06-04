import type { ToolCategory } from "../types.js";

// Tool category map, used for plan filtering and UI display.
export const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  search_kb:                    'read',
  search_shopify_products:      'read',
  search_shopify_customers:     'read',
  get_shopify_customer:         'read',
  update_shopify_customer_info: 'action',
  get_shopify_orders:           'read',
  update_shopify_order_address: 'action',
  add_shopify_customer_note:    'action',
  get_order_by_name:            'read',
  get_order_tracking:           'read',
  create_refund:                'action',
  cancel_order:                 'action',
  create_shopify_order:         'action',
  edit_shopify_order:           'action',
  add_internal_note:            'internal',
  send_reply:                   'communication',
  send_email:                   'communication',
  update_thread_status:         'internal',
  update_thread_tag:            'internal',
  escalate_to_human:            'internal',
}

// Per-module tool subsets. The capability axis (read/action/communication/
// internal) lives in TOOL_CATEGORIES; this is the orthogonal domain axis.
export type ToolGroup =
  | 'knowledge'
  | 'product'
  | 'customer'
  | 'order'
  | 'thread'
  | 'messaging'

export const TOOL_GROUPS: Record<ToolGroup, readonly string[]> = {
  knowledge: ['search_kb'],
  product:   ['search_shopify_products'],
  customer: [
    'search_shopify_customers',
    'get_shopify_customer',
    'update_shopify_customer_info',
    'add_shopify_customer_note',
  ],
  order: [
    'get_shopify_orders',
    'get_order_by_name',
    'get_order_tracking',
    'update_shopify_order_address',
    'create_refund',
    'cancel_order',
    'create_shopify_order',
    'edit_shopify_order',
  ],
  thread: [
    'add_internal_note',
    'update_thread_status',
    'update_thread_tag',
    'escalate_to_human',
  ],
  messaging: ['send_reply', 'send_email'],
}

// Flatten one or more module groups into an allow-list for selectAgentTools.
export function toolNamesForGroups(...groups: ToolGroup[]): string[] {
  return groups.flatMap((g) => [...TOOL_GROUPS[g]])
}

// Human-readable labels for executed tool calls (past tense).
export const TOOL_LABELS: Record<string, string> = {
  search_kb:                    'Searched knowledge base',
  search_shopify_products:      'Searched products',
  search_shopify_customers:     'Searched customers',
  get_shopify_customer:         'Fetched customer',
  update_shopify_customer_info: 'Updated customer info',
  get_shopify_orders:           'Fetched orders',
  update_shopify_order_address: 'Updated shipping address',
  add_shopify_customer_note:    'Added Shopify note',
  get_order_by_name:            'Looked up order',
  get_order_tracking:           'Fetched tracking info',
  create_refund:                'Issued refund',
  cancel_order:                 'Cancelled order',
  create_shopify_order:         'Created order',
  edit_shopify_order:           'Edited order',
  add_internal_note:            'Added internal note',
  send_reply:                   'Sent reply',
  send_email:                   'Sent email',
  update_thread_status:         'Updated thread status',
  update_thread_tag:            'Updated thread tag',
  escalate_to_human:            'Escalated to merchant',
}

// Human-readable labels for plan steps.
export const PLAN_STEP_LABELS: Record<string, string> = {
  search_kb:                    'Search knowledge base',
  search_shopify_products:      'Search Shopify products',
  search_shopify_customers:     'Search Shopify customers',
  get_shopify_customer:         'Fetch customer profile',
  update_shopify_customer_info: 'Update customer info on Shopify',
  get_shopify_orders:           'Fetch recent orders',
  update_shopify_order_address: 'Update shipping address on Shopify',
  add_shopify_customer_note:    'Add note to Shopify customer',
  get_order_by_name:            'Look up order',
  get_order_tracking:           'Fetch order tracking',
  create_refund:                'Issue refund',
  cancel_order:                 'Cancel order',
  create_shopify_order:         'Create Shopify order',
  edit_shopify_order:           'Edit existing order',
  add_internal_note:            'Add internal note',
  send_reply:                   'Notify customer',
  send_email:                   'Send email to customer',
  update_thread_status:         'Update ticket status',
  update_thread_tag:            'Update ticket tag',
  escalate_to_human:            'Escalate to merchant',
}
