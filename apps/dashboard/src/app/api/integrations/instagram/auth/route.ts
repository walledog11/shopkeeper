import { NextResponse } from 'next/server';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
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

  const appId = process.env.META_APP_ID;
  const configId = process.env.META_CONFIG_ID;
  const appUrl = process.env.APP_URL;

  if (!appId || !configId || !appUrl) {
    return NextResponse.json(
      { error: 'META_APP_ID, META_CONFIG_ID, or APP_URL is not configured' },
      { status: 500 }
    );
  }

  const { state } = await createOAuthSessionCookies(request, { prefix: 'ig' }, session);

  const redirectUri = `${appUrl}/api/integrations/instagram/callback`;

  // Facebook Login for Business uses config_id instead of individual scopes.
  // The configuration defines which permissions are requested.
  const authUrl = new URL('https://www.facebook.com/dialog/oauth');
  authUrl.searchParams.set('client_id', appId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('config_id', configId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl.toString());
}
