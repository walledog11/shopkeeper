import {
  defineTool,
  stringArg,
  toolError,
  type AgentToolDefinition,
  type GetOrderByNameInput,
} from '@shopkeeper/agent/tools';
import { getOrderStatusByName } from '@shopkeeper/agent/shopify';
import { loadShopContext } from './operator-shop-tools.js';

// Operator-only, like the shop tools, so the support planner's tool set is
// unchanged by this file. get_order_by_name stays the read for questions about
// items, amounts or the address; this one exists so a plain status question is
// answered from facts that cannot be padded into a paragraph.
export function buildOperatorOrderTools(
  params: { organizationId: string },
): Record<string, AgentToolDefinition> {
  const { organizationId } = params;

  const getOrderStatusTool = defineTool({
    name: 'get_order_status',
    description:
      'Check where an order stands: its payment status, whether it was cancelled, and its shipping status. Use it for any "status of order #1234" question. It returns only those facts, not items, quantities, amounts or the address; call get_order_by_name when the merchant asks about those.',
    fields: {
      order_name: stringArg("The order number as shown to the customer, e.g. '#1234' or '1234'.", { required: true }),
    },
    category: 'read',
    group: 'order',
    capabilities: [],
    requiredScopes: ['read_orders'],
    label: 'Checked order status',
    planStepLabel: 'Check order status',
    execute: async (input: GetOrderByNameInput) => {
      const shop = await loadShopContext(organizationId);
      if (!shop) return toolError('Error: no Shopify integration connected.');
      return getOrderStatusByName(input, shop.shopify);
    },
  });

  return {
    [getOrderStatusTool.name]: getOrderStatusTool,
  };
}
