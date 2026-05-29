import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@clerk/nextjs/server';
import crypto from 'crypto';
import { safeReturnTo } from '@/lib/security/safe-return-to';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';

const OUTLOOK_SCOPES = [
  'openid',
  'email',
  'offline_access',
  'User.Read',
  'Mail.Send',
].join(' ');

export async function GET(request: Request) {
  return createPostRedirectResponse(request, 'Connect Outlook');
}

export async function POST(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const appUrl = process.env.APP_URL;

  if (!clientId || !appUrl) {
    return NextResponse.json(
      { error: 'MICROSOFT_CLIENT_ID or APP_URL is not configured' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const returnTo = safeReturnTo(searchParams.get('returnTo'));

  const state = crypto.randomBytes(16).toString('hex');
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 600,
    path: '/',
  };
  const cookieStore = await cookies();
  cookieStore.set('outlook_oauth_state', state, cookieOpts);
  cookieStore.set('outlook_oauth_org', orgId, cookieOpts);
  cookieStore.set('outlook_oauth_user', userId, cookieOpts);
  if (returnTo) {
    cookieStore.set('outlook_oauth_return', returnTo, cookieOpts);
  }

  const redirectUri = `${appUrl}/api/integrations/outlook/callback`;

  const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', OUTLOOK_SCOPES);
  authUrl.searchParams.set('response_mode', 'query');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl.toString());
}
