import { NextResponse } from 'next/server';
import { BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { ShopifyRequestError } from '@clerk/agent/shopify';
import logger from '@/lib/server/logger';
import {
  lookupShopifyCustomer,
  updateShopifyCustomer,
} from './_lib/customer-service';
import { parseShopifyCustomerUpdateBody } from './_lib/validation';
import { readRequiredJsonObject } from '@/lib/api/body';

function shopifyErrorResponse(err: unknown): NextResponse {
  if (err instanceof ShopifyRequestError) {
    return NextResponse.json({ error: 'shopify_error', details: err.payload ?? {} }, { status: err.status ?? 502 });
  }
  throw err;
}

export const GET = withOrgRoute(
  { context: 'Shopify Customer GET', errorMessage: 'server_error' },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const customerId = searchParams.get('customerId');
    const parsedOrderLimit = Number.parseInt(searchParams.get('orderLimit') ?? '5', 10);
    const orderLimit = Number.isFinite(parsedOrderLimit)
      ? Math.min(Math.max(parsedOrderLimit, 0), 5)
      : 5;

    if (!email && !customerId) {
      throw new BadRequestError('Missing email or customerId');
    }

    try {
      const result = await lookupShopifyCustomer({
        organizationId: org.id,
        email,
        customerId,
        orderLimit,
      });
      return NextResponse.json(result);
    } catch (err) {
      return shopifyErrorResponse(err);
    }
  },
);

export const PATCH = withOrgRoute(
  { context: 'Shopify Customer PATCH', errorMessage: 'server_error' },
  async ({ org, request }) => {
    const { customerId, updates } = parseShopifyCustomerUpdateBody(await readRequiredJsonObject(request));

    let customer: unknown | null;
    try {
      customer = await updateShopifyCustomer(org.id, customerId, updates);
    } catch (err) {
      if (err instanceof ShopifyRequestError) {
        logger.error({ err: err.payload }, '[Shopify Customer PATCH] Shopify error');
        const errors = (err.payload as { errors?: unknown } | null)?.errors;
        return NextResponse.json({ error: errors ?? 'Failed to update customer' }, { status: err.status ?? 502 });
      }
      throw err;
    }

    if (!customer) {
      logger.error({ err: { customer } }, '[Shopify Customer PATCH] Shopify error');
      return NextResponse.json({ error: 'Failed to update customer' }, { status: 502 });
    }

    return NextResponse.json({ customer });
  },
);
