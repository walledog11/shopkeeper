import { NextResponse } from 'next/server';
import { getShopifyOAuthCallbackConfig } from '@/lib/env';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import { oauthCompleteResponse } from '@/app/api/integrations/_lib/oauth-callback';
import { runOAuthCallback } from '@/app/api/integrations/_lib/oauth-callback-runner';
import { completeShopifyOAuth } from './complete-shopify-oauth';

export async function GET(request: Request) {
  return createPostRedirectResponse(request, 'Finish Shopify connection');
}

export async function POST(request: Request) {
  const oauthConfig = getShopifyOAuthCallbackConfig();

  if (!oauthConfig) {
    if (process.env.APP_URL) {
      return oauthCompleteResponse(process.env.APP_URL, {
        outcome: { status: 'failed', provider: 'shopify', error: 'shopify_server_error' },
      });
    }
    return NextResponse.json({ error: 'OAuth callback is not configured' }, { status: 500 });
  }
  const { appUrl, clientId, clientSecret } = oauthConfig;
  return runOAuthCallback({
    request,
    descriptor: {
      analyticsPlatform: 'shopify',
      appUrl,
      extraSessionFields: ['shop'],
      invalidCallbackError: 'shopify_invalid_callback',
      logPrefix: 'Shopify OAuth',
      provider: 'shopify',
      serverError: 'shopify_server_error',
      stateMismatchError: 'shopify_state_mismatch',
    },
    complete: ({ organizationId, searchParams, session }) => completeShopifyOAuth({
      clientId,
      clientSecret,
      organizationId,
      savedShop: session.extra.shop,
      searchParams,
    }),
  });
}
