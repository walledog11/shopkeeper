import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import logger from '@/lib/server/logger';
import { buildOAuthCompleteUrl } from './oauth-complete-url';

type OAuthCompleteParams = {
  connected?: string;
  error?: string;
  returnTo?: string | null;
};

type IntegrationRedirectParams = {
  connected?: string;
  error?: string;
};

export type OAuthOrganization = NonNullable<Awaited<ReturnType<typeof db.organization.findUnique>>>;

export function oauthCompleteResponse(appUrl: string, params: OAuthCompleteParams): NextResponse {
  return NextResponse.redirect(buildOAuthCompleteUrl(appUrl, params));
}

export function integrationsResponse(appUrl: string, params: IntegrationRedirectParams): NextResponse {
  const url = new URL('/dashboard/integrations', appUrl);
  if (params.connected) url.searchParams.set('connected', params.connected);
  if (params.error) url.searchParams.set('error', params.error);
  return NextResponse.redirect(url);
}

export function oauthDestinationResponse(
  appUrl: string,
  returnTo: string | null | undefined,
  connected: string,
): NextResponse {
  if (returnTo) {
    return NextResponse.redirect(`${appUrl}${returnTo}`);
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
