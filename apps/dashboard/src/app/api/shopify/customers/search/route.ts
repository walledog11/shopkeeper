import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';

export const GET = withOrgRoute(
  { context: 'Shopify Customer Search', errorMessage: 'server_error' },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ customers: [] });
    }

    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });

    if (!integration?.accessToken) {
      throw new NotFoundError('no_integration');
    }

    const shop = integration.externalAccountId;
    const token = integration.accessToken;

    const res = await fetch(
      `https://${shop}/admin/api/2026-04/customers/search.json?query=${encodeURIComponent(q)}&limit=8&fields=id,first_name,last_name,email`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json({ error: 'shopify_error', details: errData }, { status: res.status });
    }
    const data = await res.json();

    return NextResponse.json({ customers: data.customers ?? [] });
  },
);
