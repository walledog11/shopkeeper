import type {
  SearchShopifyProductsInput,
  SearchShopifyCustomersInput,
  GetShopifyCustomerInput,
  UpdateShopifyCustomerInfoInput,
  GetShopifyOrdersInput,
  UpdateShopifyOrderAddressInput,
  AddShopifyCustomerNoteInput,
  GetOrderByNameInput,
  GetOrderTrackingInput,
  CreateRefundInput,
  CancelOrderInput,
  CreateShopifyOrderInput,
  EditShopifyOrderInput,
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

// ── search_shopify_products ───────────────────────────────────────────────────

export async function searchShopifyProducts(
  input: SearchShopifyProductsInput,
  ctx: ShopifyContext
): Promise<string> {
  const limit = Math.min(input.limit ?? 5, 10);
  const res = await fetch(
    `https://${ctx.shop}/admin/api/${API_VERSION}/products.json?title=${encodeURIComponent(input.query)}&limit=${limit}&fields=id,title,variants`,
    { headers: shopifyHeaders(ctx.accessToken) }
  );
  const data = await res.json();

  if (!res.ok) {
    return `Error: could not search products — ${JSON.stringify(data.errors ?? data)}`;
  }

  const products = data.products ?? [];
  if (products.length === 0) return `No products found matching "${input.query}".`;

  return JSON.stringify(
    products.map((p: { id: number; title: string; variants: { id: number; title: string; price: string; inventory_quantity: number }[] }) => ({
      product_id: String(p.id),
      title: p.title,
      variants: p.variants.map(v => ({
        variant_id: String(v.id),
        title: v.title,
        price: v.price,
        inventory_quantity: v.inventory_quantity,
      })),
    }))
  );
}

// ── search_shopify_customers ──────────────────────────────────────────────────

export async function searchShopifyCustomers(
  input: SearchShopifyCustomersInput,
  ctx: ShopifyContext
): Promise<string> {
  const limit = Math.min(input.limit ?? 5, 10);
  const res = await fetch(
    `https://${ctx.shop}/admin/api/${API_VERSION}/customers/search.json?query=${encodeURIComponent(input.query)}&limit=${limit}&fields=id,first_name,last_name,email,phone`,
    { headers: shopifyHeaders(ctx.accessToken) }
  );
  const data = await res.json();

  if (!res.ok) {
    return `Error: could not search customers — ${JSON.stringify(data.errors ?? data)}`;
  }

  const customers = data.customers ?? [];
  if (customers.length === 0) return `No customers found matching "${input.query}".`;

  return JSON.stringify(
    customers.map((c: { id: number; first_name: string; last_name: string; email: string; phone: string | null }) => ({
      customer_id: String(c.id),
      name: `${c.first_name} ${c.last_name}`.trim(),
      email: c.email,
      phone: c.phone ?? null,
    }))
  );
}

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
    `https://${ctx.shop}/admin/api/${API_VERSION}/orders.json?customer_id=${input.customer_id}&status=any&limit=5&fields=id,name,created_at,financial_status,fulfillment_status,total_price,current_total_price,line_items`,
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
      total_price: o.current_total_price ?? o.total_price,
      items: (o.line_items as { title: string; quantity: number; fulfillable_quantity: number }[])
        .filter((li) => li.fulfillable_quantity > 0)
        .map((li) => `${li.quantity}x ${li.title}`),
    }))
  );
}

// ── update_shopify_order_address ──────────────────────────────────────────────

export async function updateShopifyOrderAddress(
  input: UpdateShopifyOrderAddressInput,
  ctx: ShopifyContext
): Promise<string> {
  const addressPayload: Record<string, string> = {
    address1: input.address1,
    city: input.city,
    province: input.province,
    zip: input.zip,
    country: input.country,
  };
  if (input.address2) addressPayload.address2 = input.address2;

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
    `https://${ctx.shop}/admin/api/${API_VERSION}/orders.json?name=${encodeURIComponent(name)}&status=any&limit=1&fields=id,name,created_at,financial_status,fulfillment_status,total_price,current_total_price,line_items`,
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
    total_price: o.current_total_price ?? o.total_price,
    items: (o.line_items as { title: string; quantity: number; fulfillable_quantity: number }[])
      .filter((li) => li.fulfillable_quantity > 0)
      .map((li) => `${li.quantity}x ${li.title}`),
  });
}

// ── get_order_tracking ────────────────────────────────────────────────────────

export async function getOrderTracking(
  input: GetOrderTrackingInput,
  ctx: ShopifyContext
): Promise<string> {
  const res = await fetch(
    `https://${ctx.shop}/admin/api/${API_VERSION}/orders/${input.order_id}/fulfillments.json`,
    { headers: shopifyHeaders(ctx.accessToken) }
  );
  const data = await res.json();

  if (!res.ok) {
    return `Error: could not fetch fulfillments — ${JSON.stringify(data.errors ?? data)}`;
  }

  const fulfillments: {
    tracking_number: string | null;
    tracking_company: string | null;
    tracking_url: string | null;
    status: string;
    shipment_status: string | null;
    created_at: string;
  }[] = data.fulfillments ?? [];

  if (fulfillments.length === 0) {
    return "This order has not been fulfilled yet — no tracking information is available.";
  }

  const trackingNumber = fulfillments[0].tracking_number;
  const carrier = fulfillments[0].tracking_company;

  if (!trackingNumber) {
    return JSON.stringify({
      fulfillment_status: fulfillments[0].status,
      tracking_number: null,
      tracking_company: carrier ?? null,
      tracking_url: fulfillments[0].tracking_url ?? null,
      note: "Order has been marked as fulfilled but no tracking number was provided.",
    });
  }

  // Fetch live tracking events from Trackingmore
  const trackingmoreKey = process.env.TRACKINGMORE_API_KEY;
  if (!trackingmoreKey) {
    return JSON.stringify({
      fulfillment_status: fulfillments[0].status,
      tracking_number: trackingNumber,
      tracking_company: carrier ?? null,
      tracking_url: fulfillments[0].tracking_url ?? null,
      note: "Live tracking unavailable — Trackingmore not configured.",
    });
  }

  const tmRes = await fetch("https://api.trackingmore.com/v4/trackings/create", {
    method: "POST",
    headers: {
      "Tracking-Api-Key": trackingmoreKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tracking_number: trackingNumber, courier_code: carrier ?? undefined }),
  });
  const tmData = await tmRes.json();

  if (!tmRes.ok || tmData.code !== 200) {
    return JSON.stringify({
      fulfillment_status: fulfillments[0].status,
      tracking_number: trackingNumber,
      tracking_company: carrier ?? null,
      tracking_url: fulfillments[0].tracking_url ?? null,
      note: "Live tracking lookup failed — carrier data unavailable.",
    });
  }

  type TrackingmoreEvent = {
    description: string;
    date: string;
    location: string;
    tag: string;
  };

  const tracking = tmData.data ?? {};
  const events: TrackingmoreEvent[] = (tracking.origin_info?.trackinfo ?? tracking.destination_info?.trackinfo ?? []).slice(0, 10);

  return JSON.stringify({
    status: tracking.delivery_status ?? fulfillments[0].shipment_status ?? fulfillments[0].status,
    est_delivery_date: tracking.expected_delivery ?? null,
    tracking_number: trackingNumber,
    tracking_company: carrier ?? null,
    tracking_url: fulfillments[0].tracking_url ?? null,
    events: events.map((e) => ({
      message: e.description,
      status: e.tag,
      datetime: e.date,
      location: e.location ?? null,
    })),
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

// ── create_shopify_order ──────────────────────────────────────────────────────

export async function createShopifyOrder(
  input: CreateShopifyOrderInput,
  ctx: ShopifyContext
): Promise<string> {
  const shippingAddress = {
    first_name: input.first_name,
    last_name: input.last_name,
    address1: input.address1,
    ...(input.address2 ? { address2: input.address2 } : {}),
    city: input.city,
    province: input.province,
    zip: input.zip,
    country: input.country,
  };

  const lineItems = input.line_items.map((item) => {
    if (item.variant_id) {
      return { variant_id: Number(item.variant_id), quantity: item.quantity };
    }
    return {
      title: item.title,
      price: item.price,
      quantity: item.quantity,
      requires_shipping: true,
    };
  });

  const res = await fetch(
    `https://${ctx.shop}/admin/api/${API_VERSION}/orders.json`,
    {
      method: "POST",
      headers: shopifyHeaders(ctx.accessToken),
      body: JSON.stringify({
        order: {
          email: input.email,
          financial_status: "pending",
          send_receipt: false,
          send_fulfillment_receipt: false,
          line_items: lineItems,
          shipping_address: shippingAddress,
          billing_address: shippingAddress,
          ...(input.note ? { note: input.note } : {}),
        },
      }),
    }
  );
  const data = await res.json();

  if (!res.ok || !data.order) {
    return `Error: failed to create order — ${JSON.stringify(data.errors ?? data)}`;
  }

  const o = data.order;
  return `Order ${o.name} created successfully for ${input.email}. Total: $${o.total_price}. Order ID: ${o.id}.`;
}

// ── edit_shopify_order ────────────────────────────────────────────────────────

export async function editShopifyOrder(
  input: EditShopifyOrderInput,
  ctx: ShopifyContext
): Promise<string> {
  if (!input.variant_id && !input.remove_variant_id) {
    return `Error: edit_shopify_order requires at least variant_id (to add) or remove_variant_id (to remove).`;
  }

  const endpoint = `https://${ctx.shop}/admin/api/${API_VERSION}/graphql.json`;
  const orderId = `gid://shopify/Order/${input.order_id}`;

  // Step 1: Begin edit session, also fetching existing line items so we can remove one if needed
  const beginRes = await fetch(endpoint, {
    method: "POST",
    headers: shopifyHeaders(ctx.accessToken),
    body: JSON.stringify({
      query: `mutation orderEditBegin($id: ID!) {
        orderEditBegin(id: $id) {
          calculatedOrder {
            id
            lineItems(first: 20) {
              edges { node { id quantity variant { id } title } }
            }
          }
          userErrors { field message }
        }
      }`,
      variables: { id: orderId },
    }),
  });
  const beginData = await beginRes.json();
  const beginErrors = beginData.data?.orderEditBegin?.userErrors;
  if (beginErrors?.length > 0) {
    return `Error: could not begin order edit — ${beginErrors.map((e: { message: string }) => e.message).join(", ")}`;
  }
  const calculatedOrder = beginData.data?.orderEditBegin?.calculatedOrder;
  const calculatedOrderId = calculatedOrder?.id;
  if (!calculatedOrderId) {
    return `Error: failed to begin order edit — ${JSON.stringify(beginData.errors ?? beginData)}`;
  }

  // Step 2: Add the new variant (skip for pure removal)
  if (input.variant_id) {
    const variantId = `gid://shopify/ProductVariant/${input.variant_id}`;
    const addRes = await fetch(endpoint, {
      method: "POST",
      headers: shopifyHeaders(ctx.accessToken),
      body: JSON.stringify({
        query: `mutation orderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
          orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
            calculatedOrder { id }
            userErrors { field message }
          }
        }`,
        variables: { id: calculatedOrderId, variantId, quantity: input.quantity ?? 1 },
      }),
    });
    const addData = await addRes.json();
    const addErrors = addData.data?.orderEditAddVariant?.userErrors;
    if (addErrors?.length > 0) {
      return `Error: could not add item to order — ${addErrors.map((e: { message: string }) => e.message).join(", ")}`;
    }
  }

  // Step 2.5: If a remove_variant_id was specified, zero out that line item (size/color swap)
  if (input.remove_variant_id) {
    const removeVariantGid = `gid://shopify/ProductVariant/${input.remove_variant_id}`;
    type CalcLineItem = { node: { id: string; quantity: number; variant?: { id: string }; title: string } };
    const existingItems: CalcLineItem[] = calculatedOrder?.lineItems?.edges ?? [];
    const itemToRemove = existingItems.find(e => e.node.variant?.id === removeVariantGid);
    if (itemToRemove) {
      const setQtyRes = await fetch(endpoint, {
        method: "POST",
        headers: shopifyHeaders(ctx.accessToken),
        body: JSON.stringify({
          query: `mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
            orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
              calculatedOrder { id }
              userErrors { field message }
            }
          }`,
          variables: { id: calculatedOrderId, lineItemId: itemToRemove.node.id, quantity: 0 },
        }),
      });
      const setQtyData = await setQtyRes.json();
      const setQtyErrors = setQtyData.data?.orderEditSetQuantity?.userErrors;
      if (setQtyErrors?.length > 0) {
        return `Error: could not remove old item — ${setQtyErrors.map((e: { message: string }) => e.message).join(", ")}`;
      }
    }
  }

  // Step 3: Commit and return the updated line items
  const commitRes = await fetch(endpoint, {
    method: "POST",
    headers: shopifyHeaders(ctx.accessToken),
    body: JSON.stringify({
      query: `mutation orderEditCommit($id: ID!) {
        orderEditCommit(id: $id, notifyCustomer: false) {
          order {
            name
            lineItems(first: 20) {
              edges { node { title quantity variant { title } } }
            }
          }
          userErrors { field message }
        }
      }`,
      variables: { id: calculatedOrderId },
    }),
  });
  const commitData = await commitRes.json();
  const commitErrors = commitData.data?.orderEditCommit?.userErrors;
  if (commitErrors?.length > 0) {
    return `Error: could not commit order edit — ${commitErrors.map((e: { message: string }) => e.message).join(", ")}`;
  }

  const order = commitData.data?.orderEditCommit?.order;
  const orderName = order?.name ?? `#${input.order_id}`;
  const lineItems: { node: { title: string; quantity: number; variant: { title: string } | null } }[] =
    order?.lineItems?.edges ?? [];

  const itemList = lineItems
    .filter(({ node: li }) => li.quantity > 0)
    .map(({ node: li }) => `${li.quantity}x ${li.title}${li.variant?.title && li.variant.title !== 'Default Title' ? ` (${li.variant.title})` : ''}`)
    .join(', ');

  const action = input.variant_id && input.remove_variant_id ? 'swapped item on'
    : input.remove_variant_id ? 'removed item from'
    : 'added item to'
  return `Successfully ${action} order ${orderName}. Current order items: ${itemList}.`;
}
