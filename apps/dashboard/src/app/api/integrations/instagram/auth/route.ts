import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@clerk/nextjs/server';
import crypto from 'crypto';

export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
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

  // CSRF state token
  const state = crypto.randomBytes(16).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set('ig_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  // Store orgId so the callback can identify the org without a Clerk session
  cookieStore.set('ig_oauth_org', orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

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
