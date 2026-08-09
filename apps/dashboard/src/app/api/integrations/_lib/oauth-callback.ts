import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import logger from '@/lib/server/logger';
import type { OAuthFlowMode, OAuthOutcome } from '@/lib/integrations/oauth-contract';
import { buildOAuthCompleteUrl } from './oauth-complete-url';

type OAuthCompleteParams = {
  outcome: OAuthOutcome;
  mode?: OAuthFlowMode;
  returnTo?: string | null;
};

export type OAuthOrganization = NonNullable<Awaited<ReturnType<typeof db.organization.findUnique>>>;

/** After an OAuth callback POST, redirect with GET so App Router pages do not 405. */
export function oauthPageRedirect(url: string | URL): NextResponse {
  return NextResponse.redirect(url, 303);
}

/** Converts the authorization shell's POST into a provider-facing GET. */
export const oauthProviderRedirect = oauthPageRedirect;

export function oauthCompleteResponse(appUrl: string, params: OAuthCompleteParams): NextResponse {
  return oauthPageRedirect(buildOAuthCompleteUrl(appUrl, params));
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
