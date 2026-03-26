import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';

export async function GET(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ customers: [] });
    }

    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });

    if (!integration?.accessToken) {
      return NextResponse.json({ error: 'no_integration' }, { status: 404 });
    }

    const shop = integration.externalAccountId;
    const token = integration.accessToken;

    const res = await fetch(
      `https://${shop}/admin/api/2024-01/customers/search.json?query=${encodeURIComponent(q)}&limit=8&fields=id,first_name,last_name,email,orders_count`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    const data = await res.json();

    return NextResponse.json({ customers: data.customers ?? [] });

  } catch (err) {
    console.error('[Shopify Customer Search] Error:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
