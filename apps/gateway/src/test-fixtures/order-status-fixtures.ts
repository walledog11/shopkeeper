// The order, catalog and provider stubs shared by the order-status support-plan suites.
import { createHash, randomUUID } from 'node:crypto';

// The Shopify client paces requests with an in-process token bucket per shop
// that is never reset, so a shared domain drains its burst early in the file
// and every later mocked request waits ~500ms for a refill.
export const shopDomain = () => `fixture-${randomUUID()}.myshopify.com`;

// Context pre-fetches the customer's name and tolerates any failure. A thrown
// fetch is retried after a 500ms sleep; a 404 is not.
export const customerNotFound = () => new Response(JSON.stringify({ errors: 'Not Found' }), { status: 404 });

export const order = {
  id: 9000001001,
  customer: { id: 1234 },
  name: '#1001',
  created_at: '2026-09-18T10:00:00-07:00',
  financial_status: 'paid',
  fulfillment_status: 'fulfilled',
  current_total_price: '42.00',
  total_price: '42.00',
  currency: 'USD',
  line_items: [{
    id: 7001,
    title: 'Black shirt',
    quantity: 1,
    fulfillable_quantity: 0,
    current_quantity: 1,
    fulfillment_status: 'fulfilled',
    variant_id: 8001,
  }],
  shipping_address: null,
};

const catalogProduct = {
  id: 'gid://shopify/Product/9001',
  title: 'Pencil Half Zip',
  variants: {
    nodes: [{
      id: 'gid://shopify/ProductVariant/9101',
      title: 'Navy / Medium',
      price: '78.00',
      inventoryQuantity: 6,
    }],
  },
};

export function toolUse(id: string, name: string, input: Record<string, unknown>) {
  return {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id, name, input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

// Dashboard's send hop, accepting the reply with a succeeded send_reply receipt.
export const acceptedSendReply = async (
  _path: string,
  body: {
    operationId?: string;
    executionId?: string;
    threadId: string;
    input: { text: string };
  },
) => ({
  ok: true,
  data: {
    status: 'ok',
    message: 'Reply accepted for delivery.',
    receipt: {
      version: 1,
      operationId: body.operationId,
      executionId: body.executionId,
      tool: 'send_reply',
      target: { kind: 'thread', id: body.threadId },
      observedAt: '2026-09-19T12:00:00.000Z',
      outcome: 'succeeded',
      providerReference: 'provider-message-1',
      facts: {
        logicalResponseId: 'provider-message-1',
        messageId: 'provider-message-1',
        threadId: body.threadId,
        destination: { kind: 'thread', id: body.threadId },
        contentSha256: createHash('sha256').update(body.input.text).digest('hex'),
        deliveryState: 'sent',
        providerMessageId: 'provider-message-1',
      },
    },
  },
});

// Shopify as the order-status thread sees it; anything else is an unexpected request.
export async function orderStatusProviderFetch(input: string | URL | Request) {
  const url = String(input);
  if (url.includes('/admin/api/') && url.includes('/orders.json')) {
    return new Response(JSON.stringify({ orders: [order] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (url.includes('/admin/api/') && url.includes('/graphql.json')) {
    return new Response(JSON.stringify({
      data: { products: { nodes: [catalogProduct] } },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (url.includes('/customers/1234.json')) return customerNotFound();
  throw new Error(`Unexpected external request: ${url}`);
}
