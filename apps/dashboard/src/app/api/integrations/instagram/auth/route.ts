import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import logger from '@/lib/server/logger';
import {
  getInstagramOAuthAuthorizeConfig,
  isInstagramIntegrationEnabledForOrg,
} from '@/lib/env';
import { buildInstagramAuthorizationUrl } from '@/lib/integrations/instagram-api-client';
import {
  createOAuthSessionCookies,
  requireAuthenticatedOAuthSession,
} from '@/app/api/integrations/_lib/oauth-session';
import { oauthProviderRedirect } from '@/app/api/integrations/_lib/oauth-callback';

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

export async function GET(request: Request) {
  return createPostRedirectResponse(request, 'Connect Instagram');
}

export async function POST(request: Request) {
  const sessionResult = await requireAuthenticatedOAuthSession();
  if (!sessionResult.ok) return sessionResult.response;
  const session = sessionResult.session;
  if (!isInstagramIntegrationEnabledForOrg(session.orgId)) {
    return NextResponse.json({ error: 'instagram_not_available' }, { status: 403 });
  }

  const oauthConfig = getInstagramOAuthAuthorizeConfig();

  if (!oauthConfig) {
    return NextResponse.json(
      { error: 'INSTAGRAM_APP_ID or APP_URL is not configured' },
      { status: 500 }
    );
  }

  const { state } = await createOAuthSessionCookies(
    request,
    { provider: 'instagram' },
    session,
  );
  const authUrl = buildInstagramAuthorizationUrl({
    appId: oauthConfig.appId,
    redirectUri: oauthConfig.redirectUri,
    state,
    forceReauth: true,
  });

  logger.info(
    {
      appIdFingerprint: fingerprint(oauthConfig.appId),
      redirectUri: oauthConfig.redirectUri,
      redirectUriFingerprint: fingerprint(oauthConfig.redirectUri),
    },
    '[IG OAuth] Authorization request prepared',
  );

  // This route is submitted by the popup shell as POST. A 303 is required so
  // the browser follows the provider redirect with GET instead of preserving
  // POST (the behavior of NextResponse.redirect's default 307).
  return oauthProviderRedirect(authUrl);
}
