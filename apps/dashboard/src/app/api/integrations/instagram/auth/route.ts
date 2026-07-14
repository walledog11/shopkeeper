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

  return NextResponse.redirect(authUrl);
}
