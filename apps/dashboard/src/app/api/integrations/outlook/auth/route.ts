import { NextResponse } from 'next/server';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import {
  createOAuthSessionCookies,
  requireAuthenticatedOAuthSession,
} from '@/app/api/integrations/_lib/oauth-session';

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
  const session = await requireAuthenticatedOAuthSession();
  if (!session) {
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

  const { state } = await createOAuthSessionCookies(request, { prefix: 'outlook' }, session);

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
