import type { BaseAgentContext, SupportContext } from '../agent-context.js';
import { CHANNEL_TYPE, isOperatorChannel } from '../thread-constants.js';
import { normalizeOrderName } from '../order-reference.js';
import { shopifyRestJson } from '../shopify/client.js';
import type { AgentToolDefinition } from './registry/index.js';

const REFUSAL = 'Customer or order identity could not be verified for this conversation. Ask the merchant to verify it; do not disclose details or change the order.';

/** Customer messages never grant store-wide customer/order access. */
export async function checkSupportAuthorization(
  definition: AgentToolDefinition,
  input: unknown,
  ctx: BaseAgentContext,
): Promise<string | null> {
  const support = ctx as Partial<SupportContext>;
  const thread = support.thread;
  if (!thread || isOperatorChannel(thread.channelType) || thread.channelType === CHANNEL_TYPE.SHOPIFY_CHAT) return null;
  if (!ctx.shopify || !definition.capabilities.includes('shopify')) return null;
  if (definition.group !== 'customer' && definition.group !== 'order') return null;
  // This tool intentionally exposes only non-identifying shipping state.
  if (definition.name === 'get_order_fulfillment_status') return null;

  const customerId = thread.shopifyCustomerId;
  if (!customerId || !/^\d+$/.test(customerId)) return REFUSAL;
  const args = input as Record<string, unknown>;
  if (args.customer_id !== undefined && String(args.customer_id) !== customerId) return REFUSAL;
  if (definition.name === 'find_customer') {
    return args.by === 'id' && args.value === customerId ? null : REFUSAL;
  }
  // Creating/fulfilling orders requires the authenticated operator surface.
  if (definition.name === 'create_shopify_order' || definition.name === 'fulfill_order') return REFUSAL;

  const orderId = typeof args.order_id === 'string' ? args.order_id : null;
  const orderName = typeof args.order_name === 'string' ? args.order_name : null;
  if (!orderId && !orderName) return null;
  if (orderId && !/^\d+$/.test(orderId)) return REFUSAL;
  try {
    const order = orderId
      ? (await shopifyRestJson<{ order?: { customer?: { id: string | number } | null } }>(
          ctx.shopify, `orders/${orderId}.json`, { query: { fields: 'id,customer' } },
        )).order
      : (await shopifyRestJson<{ orders?: Array<{ customer?: { id: string | number } | null }> }>(
          ctx.shopify, 'orders.json', {
            query: { name: normalizeOrderName(orderName!), customer_id: customerId, status: 'any', limit: 1, fields: 'id,customer' },
          },
        )).orders?.[0];
    return String(order?.customer?.id ?? '') === customerId ? null : REFUSAL;
  } catch {
    // Unavailable ownership evidence never falls back to model judgment.
    return REFUSAL;
  }
}
