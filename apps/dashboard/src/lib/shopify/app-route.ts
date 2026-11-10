import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { assertBillingWriteAllowed } from '@shopkeeper/db/billing-write-gate';
import { ApiError, handleApiError, NotFoundError } from '@/lib/api/errors';
import { getShopifyOAuthCallbackConfig } from '@/lib/env';
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit';
import { verifyShopifySessionToken } from './session-token';

interface ShopifyAppRouteOptions {
  context: string;
  errorMessage: string;
  requireBillingWriteAllowed?: boolean;
  // Keyed per workspace, so the dashboard and Shopify admin share one budget.
  rateLimit?: { key: string; limit: number; windowSecs: number };
}

interface ShopifyAppRouteContext {
  org: { id: string; name: string };
  request: Request;
}

// App Bridge retries a request answered with this header once, with a new token.
const RETRY_WITH_NEW_SESSION = { 'X-Shopify-Retry-Invalid-Session-Request': '1' };

function bearerToken(request: Request): string | null {
  return request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
}

/**
 * API routes for the app home inside Shopify admin, which has no Clerk session.
 * The caller is whoever Shopify issued the ID token to (Shopify's staff
 * permissions decide who can open the app), and the workspace is the one
 * connected to that token's shop. Nothing in the request can name another.
 */
export function withShopifyAppRoute(
  options: ShopifyAppRouteOptions,
  handler: (ctx: ShopifyAppRouteContext) => Promise<Response>,
) {
  return async (request: Request): Promise<Response> => {
    try {
      const config = getShopifyOAuthCallbackConfig();
      if (!config) throw new ApiError('Shopify is not configured.', 500);
      const session = verifyShopifySessionToken(bearerToken(request), config);
      if (!session) {
        return NextResponse.json(
          { error: 'Your Shopify session expired. Reload the page.' },
          { status: 401, headers: RETRY_WITH_NEW_SESSION },
        );
      }

      const integration = await db.integration.findFirst({
        where: { platform: 'shopify', externalAccountId: session.shop, lifecycleStatus: 'active' },
        select: { organization: { select: { id: true, name: true, stripeStatus: true, lifecycleStatus: true } } },
      });
      if (!integration) throw new NotFoundError('Connect this store to Shopkeeper first.');
      const { organization } = integration;
      if (organization.lifecycleStatus !== 'active') throw new ApiError('Workspace deletion is in progress.', 409);
      if (options.requireBillingWriteAllowed) assertBillingWriteAllowed(organization);
      if (options.rateLimit) {
        const { key, limit, windowSecs } = options.rateLimit;
        const result = await rateLimit(`${key}:${organization.id}`, limit, windowSecs);
        if (!result.success) return tooManyRequests(result.reset);
      }
      return await handler({ org: { id: organization.id, name: organization.name }, request });
    } catch (error) {
      return handleApiError(error, options.context, options.errorMessage);
    }
  };
}
