import { NextResponse } from 'next/server';
import { createSocialApiClient } from '@shopkeeper/integrations/socialapi';
import { getDashboardAppUrl } from '@/lib/env';
import logger from '@/lib/server/logger';
import { resolveSocialApiBrandForOrg } from '@/lib/socialapi/config';
import {
  createOAuthSessionCookies,
  createOAuthState,
  type AuthenticatedOAuthSession,
} from '@/app/api/integrations/_lib/oauth-session';
import { oauthPageRedirect } from '@/app/api/integrations/_lib/oauth-callback';

const SOCIALAPI_CALLBACK_PATH = '/api/integrations/instagram/socialapi/callback';

/**
 * SocialAPI mints the OAuth state, so ours cannot ride the `state` parameter
 * back. It travels in the redirect URI instead, which the vendor echoes to the
 * browser and which the exchange call must repeat byte-for-byte — so both
 * halves of the flow derive it from here rather than writing it twice.
 */
export function socialApiRedirectUri(appUrl: string, attemptState: string): string {
  const redirectUri = new URL(`${appUrl}${SOCIALAPI_CALLBACK_PATH}`);
  redirectUri.searchParams.set('attempt', attemptState);
  return redirectUri.toString();
}

export async function startSocialApiInstagramConnect(
  request: Request,
  session: AuthenticatedOAuthSession,
): Promise<Response> {
  const assignment = resolveSocialApiBrandForOrg(session.orgId);
  if (!assignment) {
    return NextResponse.json({ error: 'instagram_not_available' }, { status: 403 });
  }

  const attemptState = createOAuthState();
  const redirectUri = socialApiRedirectUri(getDashboardAppUrl(), attemptState);
  const connect = await createSocialApiClient({
    apiKey: assignment.apiKey,
    baseUrl: assignment.baseUrl,
  }).beginInstagramConnect({ brandId: assignment.brandId, redirectUri });

  if (!connect.ok) {
    logger.error(
      {
        category: connect.error.category,
        httpStatus: connect.error.httpStatus,
        requestId: connect.error.requestId,
      },
      '[SocialAPI OAuth] Connect initiation failed',
    );
    return NextResponse.json({ error: 'provider_unavailable' }, { status: 502 });
  }

  // The attempt cookie is written only once the provider has an authorization
  // URL waiting for it, so a vendor outage leaves no half-started attempt.
  await createOAuthSessionCookies(
    request,
    { provider: 'instagram' },
    session,
    { socialApiState: connect.data.state, socialApiBrandId: assignment.brandId },
    attemptState,
  );

  logger.info(
    { organizationId: session.orgId },
    '[SocialAPI OAuth] Authorization request prepared',
  );

  // The popup submits this route as POST; the provider's authorize page must be
  // opened with GET, so the redirect must not preserve the method.
  return oauthPageRedirect(connect.data.authUrl);
}
