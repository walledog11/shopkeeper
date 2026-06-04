import { NextResponse } from 'next/server';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import {
  createOAuthSessionCookies,
  requireAuthenticatedOAuthSession,
} from '@/app/api/integrations/_lib/oauth-session';

const GMAIL_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

export async function GET(request: Request) {
  return createPostRedirectResponse(request, 'Connect Gmail');
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedOAuthSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.APP_URL;

  if (!clientId || !appUrl) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID or APP_URL is not configured' },
      { status: 500 }
    );
  }

  const { state } = await createOAuthSessionCookies(request, { prefix: 'gmail' }, session);

  const redirectUri = `${appUrl}/api/integrations/gmail/callback`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GMAIL_SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl.toString());
}
