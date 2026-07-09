import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import logger from '@/lib/server/logger';
import { buildOAuthCompleteUrl } from './oauth-complete-url';

type OAuthCompleteParams = {
  connected?: string;
  error?: string;
  integration?: string;
  returnTo?: string | null;
};

type IntegrationRedirectParams = {
  connected?: string;
  error?: string;
};

export type OAuthOrganization = NonNullable<Awaited<ReturnType<typeof db.organization.findUnique>>>;

/** After an OAuth callback POST, redirect with GET so App Router pages do not 405. */
export function oauthPageRedirect(url: string | URL): NextResponse {
  return NextResponse.redirect(url, 303);
}

export function oauthCompleteResponse(appUrl: string, params: OAuthCompleteParams): NextResponse {
  return oauthPageRedirect(buildOAuthCompleteUrl(appUrl, params));
}

export function integrationsResponse(appUrl: string, params: IntegrationRedirectParams): NextResponse {
  const url = new URL('/dashboard/integrations', appUrl);
  if (params.connected) url.searchParams.set('connected', params.connected);
  if (params.error) url.searchParams.set('error', params.error);
  return oauthPageRedirect(url);
}

export function oauthDestinationResponse(
  appUrl: string,
  returnTo: string | null | undefined,
  connected: string,
): NextResponse {
  if (returnTo) {
    return oauthPageRedirect(`${appUrl}${returnTo}`);
  }
  return integrationsResponse(appUrl, { connected });
}

export async function resolveOAuthOrganization(
  clerkOrgId: string | null | undefined,
  logPrefix: string,
): Promise<{ ok: true; org: OAuthOrganization } | { ok: false; error: 'server_error' }> {
  if (!clerkOrgId) {
    logger.error(`[${logPrefix}] Missing org cookie — session likely interrupted`);
    return { ok: false, error: 'server_error' };
  }

  const org = await db.organization.findUnique({ where: { clerkOrgId } });
  if (!org) {
    logger.error({ clerkOrgId }, `[${logPrefix}] Org not found`);
    return { ok: false, error: 'server_error' };
  }

  return { ok: true, org };
}
