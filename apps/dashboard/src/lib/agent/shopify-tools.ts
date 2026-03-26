import type {
  GetShopifyCustomerInput,
  UpdateShopifyCustomerInfoInput,
  GetShopifyOrdersInput,
  UpdateShopifyOrderAddressInput,
  AddShopifyCustomerNoteInput,
  GetOrderByNameInput,
  CreateRefundInput,
  CancelOrderInput,
} from "./tools";

interface ShopifyContext {
  shop: string;
  accessToken: string;
}

function shopifyHeaders(token: string) {
  return {
    "X-Shopify-Access-Token": token,
    "Content-Type": "application/json",
  };
}

const API_VERSION = "2024-01";

// ── get_shopify_customer ──────────────────────────────────────────────────────

export async function getShopifyCustomer(
  input: GetShopifyCustomerInput,
  ctx: ShopifyContext
): Promise<string> {
  const res = await fetch(
    `https://${ctx.shop}/admin/api/${API_VERSION}/customers/${input.customer_id}.json?fields=id,first_name,last_name,email,phone,orders_count,total_spent,default_address,note`,
    { headers: shopifyHeaders(ctx.accessToken) }
  );
  const data = await res.json();

  if (!res.ok || !data.customer) {
    return `Error: could not fetch customer — ${JSON.stringify(data.errors ?? data)}`;
  }

  const c = data.customer;
  const addr = c.default_address;
  return JSON.stringify({
    id: c.id,
    name: `${c.first_name} ${c.last_name}`.trim(),
    email: c.email,
    phone: c.phone,
    orders_count: c.orders_count,
    total_spent: c.total_spent,
    note: c.note,
    default_address: addr
      ? {
          address1: addr.address1,
          city: addr.city,
          province: addr.province,
          zip: addr.zip,
          country: addr.country_name ?? addr.country,
        }
      : null,
  });
}

// ── update_shopify_customer_info ─────────────────────────────────────────────

export async function updateShopifyCustomerInfo(
  input: UpdateShopifyCustomerInfoInput,
  ctx: ShopifyContext
): Promise<string> {
  const payload: Record<string, string> = { id: input.customer_id };
  if (input.first_name !== undefined) payload.first_name = input.first_name;
  if (input.last_name  !== undefined) payload.last_name  = input.last_name;
  if (input.email      !== undefined) payload.email      = input.email;
  if (input.phone      !== undefined) payload.phone      = input.phone;

  const res = await fetch(
    `https://${ctx.shop}/admin/api/${API_VERSION}/customers/${input.customer_id}.json`,
    {
      method: "PUT",
      headers: shopifyHeaders(ctx.accessToken),
      body: JSON.stringify({ customer: payload }),
    }
  );
  const data = await res.json();

  if (!res.ok || !data.customer) {
    return `Error: failed to update customer info — ${JSON.stringify(data.errors ?? data)}`;
  }

  const c = data.customer;
  return `Customer info updated. Name: ${c.first_name} ${c.last_name}, Email: ${c.email}, Phone: ${c.phone ?? "none"}.`;
}

// ── get_shopify_orders ────────────────────────────────────────────────────────

export async function getShopifyOrders(
  input: GetShopifyOrdersInput,
  ctx: ShopifyContext
): Promise<string> {
  const res = await fetch(
    `https://${ctx.shop}/admin/api/${API_VERSION}/orders.json?customer_id=${input.customer_id}&status=any&limit=5&fields=id,name,created_at,financial_status,fulfillment_status,total_price,line_items`,
    { headers: shopifyHeaders(ctx.accessToken) }
  );
  const data = await res.json();

  if (!res.ok) {
    return `Error: could not fetch orders — ${JSON.stringify(data.errors ?? data)}`;
  }

  const orders = data.orders ?? [];
  if (orders.length === 0) return "No orders found for this customer.";

  return JSON.stringify(
    orders.map((o: Record<string, unknown>) => ({
      id: o.id,
      name: o.name,
      created_at: o.created_at,
      financial_status: o.financial_status,
      fulfillment_status: o.fulfillment_status,
      total_price: o.total_price,
      items: (o.line_items as { title: string; quantity: number }[]).map(
        (li) => `${li.quantity}x ${li.title}`
      ),
    }))
  );
}

// ── update_shopify_order_address ──────────────────────────────────────────────

export async function updateShopifyOrderAddress(
  input: UpdateShopifyOrderAddressInput,
  ctx: ShopifyContext
): Promise<string> {
  const addressPayload = {
    address1: input.address1,
    city: input.city,
    province: input.province,
    zip: input.zip,
    country: input.country,
  };

  // Update the order's shipping address
  const orderRes = await fetch(
    `https://${ctx.shop}/admin/api/${API_VERSION}/orders/${input.order_id}.json`,
    {
      method: "PUT",
      headers: shopifyHeaders(ctx.accessToken),
      body: JSON.stringify({ order: { id: Number(input.order_id), shipping_address: addressPayload } }),
    }
  );
  const orderData = await orderRes.json();

  if (!orderRes.ok) {
    return `Error: failed to update order shipping address (${orderRes.status}) — ${JSON.stringify(orderData.errors ?? orderData)}`;
  }

  const addr = orderData.order?.shipping_address;
  if (!addr) {
    return `Error: order ${input.order_id} not found or already fulfilled (shipping address cannot be changed after fulfillment).`;
  }

  // Also update the customer's default address so the profile stays in sync
  const custRes = await fetch(
    `https://${ctx.shop}/admin/api/${API_VERSION}/customers/${input.customer_id}.json?fields=id,default_address`,
    { headers: shopifyHeaders(ctx.accessToken) }
  );
  const custData = await custRes.json();
  const defaultAddressId: number | undefined = custData.customer?.default_address?.id;

  if (defaultAddressId) {
    await fetch(
      `https://${ctx.shop}/admin/api/${API_VERSION}/customers/${input.customer_id}/addresses/${defaultAddressId}.json`,
      {
        method: "PUT",
        headers: shopifyHeaders(ctx.accessToken),
        body: JSON.stringify({ address: addressPayload }),
      }
    );
  }

  return `Order #${orderData.order.order_number ?? input.order_id} shipping address updated to: ${[addr.address1, addr.city, addr.province, addr.zip, addr.country].filter(Boolean).join(", ")}. Customer profile also updated.`;
}

// ── add_shopify_customer_note ─────────────────────────────────────────────────

export async function addShopifyCustomerNote(
  input: AddShopifyCustomerNoteInput,
  ctx: ShopifyContext
): Promise<string> {
  // Fetch existing note first so we can append rather than overwrite
  const getRes = await fetch(
    `https://${ctx.shop}/admin/api/${API_VERSION}/customers/${input.customer_id}.json?fields=id,note`,
    { headers: shopifyHeaders(ctx.accessToken) }
  );
  const getData = await getRes.json();
  const existingNote: string = getData.customer?.note ?? "";
  const newNote = existingNote
    ? `${existingNote}\n\n${input.note}`
    : input.note;

  const res = await fetch(
    `https://${ctx.shop}/admin/api/${API_VERSION}/customers/${input.customer_id}.json`,
    {
      method: "PUT",
      headers: shopifyHeaders(ctx.accessToken),
      body: JSON.stringify({ customer: { id: input.customer_id, note: newNote } }),
    }
  );
  const data = await res.json();

  if (!res.ok || !data.customer) {
    return `Error: failed to add note — ${JSON.stringify(data.errors ?? data)}`;
  }

  return `Note added to Shopify customer record: "${input.note}"`;
}

// ── get_order_by_name ─────────────────────────────────────────────────────────

export async function getOrderByName(
  input: GetOrderByNameInput,
  ctx: ShopifyContext
): Promise<string> {
  const name = input.order_name.startsWith("#") ? input.order_name : `#${input.order_name}`;
  const res = await fetch(
    `https://${ctx.shop}/admin/api/${API_VERSION}/orders.json?name=${encodeURIComponent(name)}&status=any&limit=1&fields=id,name,created_at,financial_status,fulfillment_status,total_price,line_items`,
    { headers: shopifyHeaders(ctx.accessToken) }
  );
  const data = await res.json();

  if (!res.ok) {
    return `Error: could not search orders — ${JSON.stringify(data.errors ?? data)}`;
  }

  const orders = data.orders ?? [];
  if (orders.length === 0) return `No order found with number ${name}.`;

  const o = orders[0];
  return JSON.stringify({
    id: o.id,
    name: o.name,
    created_at: o.created_at,
    financial_status: o.financial_status,
    fulfillment_status: o.fulfillment_status,
    total_price: o.total_price,
    items: (o.line_items as { title: string; quantity: number }[]).map(
      (li) => `${li.quantity}x ${li.title}`
    ),
  });
}

// ── create_refund ─────────────────────────────────────────────────────────────

export async function createRefund(
  input: CreateRefundInput,
  ctx: ShopifyContext
): Promise<string> {
  // If no amount specified, calculate the full refund amount
  let transactions: { kind: string; gateway: string; amount: string }[] = [];

  if (!input.amount) {
    const calcRes = await fetch(
      `https://${ctx.shop}/admin/api/${API_VERSION}/orders/${input.order_id}/refunds/calculate.json`,
      {
        method: "POST",
        headers: shopifyHeaders(ctx.accessToken),
        body: JSON.stringify({ refund: { shipping: { full_refund: true }, refund_line_items: [] } }),
      }
    );
    const calcData = await calcRes.json();
    if (!calcRes.ok) {
      return `Error: could not calculate refund — ${JSON.stringify(calcData.errors ?? calcData)}`;
    }
    transactions = (calcData.refund?.suggested_transactions ?? []).map(
      (t: { kind: string; gateway: string; amount: string }) => ({
        kind: "refund",
        gateway: t.gateway,
        amount: t.amount,
      })
    );
  } else {
    // Get gateway from the order's existing transactions
    const orderRes = await fetch(
      `https://${ctx.shop}/admin/api/${API_VERSION}/orders/${input.order_id}/transactions.json?fields=gateway`,
      { headers: shopifyHeaders(ctx.accessToken) }
    );
    const orderData = await orderRes.json();
    const gateway: string = orderData.transactions?.[0]?.gateway ?? "manual";
    transactions = [{ kind: "refund", gateway, amount: input.amount }];
  }

  const res = await fetch(
    `https://${ctx.shop}/admin/api/${API_VERSION}/orders/${input.order_id}/refunds.json`,
    {
      method: "POST",
      headers: shopifyHeaders(ctx.accessToken),
      body: JSON.stringify({
        refund: {
          notify: true,
          note: input.reason ?? "",
          transactions,
        },
      }),
    }
  );
  const data = await res.json();

  if (!res.ok || !data.refund) {
    return `Error: failed to create refund — ${JSON.stringify(data.errors ?? data)}`;
  }

  const totalRefunded = (data.refund.transactions as { amount: string }[])
    .reduce((sum, t) => sum + parseFloat(t.amount), 0)
    .toFixed(2);

  return `Refund of $${totalRefunded} issued successfully for order ${input.order_id}.${input.reason ? ` Reason: ${input.reason}.` : ""}`;
}

// ── cancel_order ──────────────────────────────────────────────────────────────

export async function cancelOrder(
  input: CancelOrderInput,
  ctx: ShopifyContext
): Promise<string> {
  const res = await fetch(
    `https://${ctx.shop}/admin/api/${API_VERSION}/orders/${input.order_id}/cancel.json`,
    {
      method: "POST",
      headers: shopifyHeaders(ctx.accessToken),
      body: JSON.stringify({
        reason: input.reason ?? "other",
        restock: input.restock ?? true,
        email: false,
      }),
    }
  );
  const data = await res.json();

  if (!res.ok || !data.order) {
    return `Error: failed to cancel order — ${JSON.stringify(data.errors ?? data)}`;
  }

  return `Order ${data.order.name} (${input.order_id}) cancelled successfully. Reason: ${input.reason ?? "other"}. Items ${input.restock !== false ? "restocked" : "not restocked"}.`;
}

export type { ShopifyContext };
