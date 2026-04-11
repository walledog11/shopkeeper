import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import logger from '@/lib/logger';

const CUSTOMER_FIELDS = 'id,first_name,last_name,email,phone,note,orders_count,total_spent,default_address';

export async function GET(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const customerId = searchParams.get('customerId');

    if (!email && !customerId) {
      return NextResponse.json({ error: 'Missing email or customerId' }, { status: 400 });
    }

    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });

    if (!integration?.accessToken) {
      return NextResponse.json({ error: 'no_integration' }, { status: 404 });
    }

    const shop = integration.externalAccountId;
    const token = integration.accessToken;

    let customer: ShopifyCustomer | null = null;

    if (customerId) {
      const res = await fetch(
        `https://${shop}/admin/api/2024-01/customers/${customerId}.json?fields=${CUSTOMER_FIELDS}`,
        { headers: { 'X-Shopify-Access-Token': token } }
      );
      const data = await res.json();
      customer = data.customer ?? null;
    } else {
      const res = await fetch(
        `https://${shop}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(email!)}&fields=${CUSTOMER_FIELDS}`,
        { headers: { 'X-Shopify-Access-Token': token } }
      );
      const data = await res.json();
      customer = (data.customers ?? [])[0] ?? null;
    }

    if (!customer) {
      return NextResponse.json({ customer: null, orders: [] });
    }

    const ordersRes = await fetch(
      `https://${shop}/admin/api/2024-01/orders.json?customer_id=${customer.id}&status=any&limit=5&fields=id,name,created_at,financial_status,fulfillment_status,total_price,line_items`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    const ordersData = await ordersRes.json();
    const orders: ShopifyOrder[] = ordersData.orders ?? [];

    return NextResponse.json({ customer, orders, shop });

  } catch (err) {
    logger.error({ err }, '[Shopify Customer GET] Error');
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { customerId, updates } = await request.json();

    if (!customerId || !updates) {
      return NextResponse.json({ error: 'Missing customerId or updates' }, { status: 400 });
    }

    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });

    if (!integration?.accessToken) {
      return NextResponse.json({ error: 'no_integration' }, { status: 404 });
    }

    const shop = integration.externalAccountId;
    const token = integration.accessToken;

    // Build the Shopify customer update payload
    const customerPayload: Record<string, unknown> = {
      id: customerId,
      ...(updates.first_name !== undefined && { first_name: updates.first_name }),
      ...(updates.last_name  !== undefined && { last_name:  updates.last_name  }),
      ...(updates.email      !== undefined && { email:      updates.email      }),
      ...(updates.phone      !== undefined && { phone:      updates.phone      }),
      ...(updates.note       !== undefined && { note:       updates.note       }),
    };

    // Address is updated via the default_address sub-object
    if (updates.address) {
      customerPayload.addresses = [{
        ...(updates.address.address1 !== undefined && { address1: updates.address.address1 }),
        ...(updates.address.city     !== undefined && { city:     updates.address.city     }),
        ...(updates.address.province !== undefined && { province: updates.address.province }),
        ...(updates.address.zip      !== undefined && { zip:      updates.address.zip      }),
        ...(updates.address.country  !== undefined && { country:  updates.address.country  }),
        default: true,
      }];
    }

    const res = await fetch(`https://${shop}/admin/api/2024-01/customers/${customerId}.json`, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customer: customerPayload }),
    });

    const data = await res.json();

    if (!res.ok || !data.customer) {
      logger.error({ err: data }, '[Shopify Customer PATCH] Shopify error');
      return NextResponse.json({ error: data.errors ?? 'Failed to update customer' }, { status: res.status });
    }

    return NextResponse.json({ customer: data.customer });

  } catch (err) {
    logger.error({ err }, '[Shopify Customer PATCH] Error');
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShopifyCustomer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  note: string | null;
  orders_count: number;
  total_spent: string;
  default_address: ShopifyAddress | null;
}

interface ShopifyAddress {
  id: number;
  address1: string | null;
  city: string | null;
  province: string | null;
  country_name: string | null;
  zip: string | null;
}

interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  line_items: { title: string; quantity: number }[];
}
