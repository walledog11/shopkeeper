import { NextResponse } from 'next/server';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import { getInstagramOAuthAuthorizeConfig } from '@/lib/env';
import { buildInstagramAuthorizationUrl } from '@/lib/integrations/instagram-api-client';
import {
  createOAuthSessionCookies,
  requireAuthenticatedOAuthSession,
} from '@/app/api/integrations/_lib/oauth-session';

export async function GET(request: Request) {
  return createPostRedirectResponse(request, 'Connect Instagram');
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedOAuthSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const oauthConfig = getInstagramOAuthAuthorizeConfig();

  if (!oauthConfig) {
    return NextResponse.json(
      { error: 'INSTAGRAM_APP_ID or APP_URL is not configured' },
      { status: 500 }
    );
  }

  const { state } = await createOAuthSessionCookies(request, { prefix: 'ig' }, session);
  const authUrl = buildInstagramAuthorizationUrl({
    appId: oauthConfig.appId,
    redirectUri: oauthConfig.redirectUri,
    state,
    forceReauth: true,
  });

  // This route is submitted by the popup shell as POST. A 303 is required so
  // the browser follows the provider redirect with GET instead of preserving
  // POST (the behavior of NextResponse.redirect's default 307).
  return NextResponse.redirect(authUrl, 303);
}
