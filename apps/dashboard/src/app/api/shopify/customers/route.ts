import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { first_name, last_name, email } = await request.json();

    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });

    if (!integration?.accessToken) {
      return NextResponse.json({ error: 'no_integration' }, { status: 404 });
    }

    const shop = integration.externalAccountId;
    const token = integration.accessToken;

    const res = await fetch(`https://${shop}/admin/api/2024-01/customers.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer: {
          first_name: first_name || '',
          last_name: last_name || '',
          email: email || undefined,
        },
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.customer) {
      return NextResponse.json({ error: data.errors ?? 'Failed to create customer' }, { status: res.status });
    }

    return NextResponse.json({ customer: data.customer });

  } catch (err) {
    console.error('[Shopify Customer POST] Error:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
