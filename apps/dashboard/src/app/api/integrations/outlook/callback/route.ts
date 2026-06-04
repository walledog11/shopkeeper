import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import logger from '@/lib/server/logger';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import { validateOAuthCallbackSession } from '@/app/api/integrations/_lib/oauth-session';
import { upsertExclusiveEmailIntegration } from '@/app/api/integrations/_lib/email-integration';

const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const USERINFO_URL = 'https://graph.microsoft.com/v1.0/me';

export async function GET(request: Request) {
  return createPostRedirectResponse(request, 'Finish Outlook connection');
}

export async function POST(request: Request) {
  const appUrl = process.env.APP_URL;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!appUrl || !clientId || !clientSecret) {
    return NextResponse.json({ error: 'OAuth callback is not configured' }, { status: 500 });
  }
  const redirectUri = `${appUrl}/api/integrations/outlook/callback`;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');

  if (oauthError) {
    logger.warn({ error: oauthError }, '[Outlook OAuth] User denied access');
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=access_denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=invalid_callback`);
  }

  const callbackSession = await validateOAuthCallbackSession({
    appUrl,
    logPrefix: 'Outlook OAuth',
    prefix: 'outlook',
    state,
  });
  if (!callbackSession.ok) return callbackSession.response;
  const { clerkOrgId, returnTo } = callbackSession.session;

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      cache: 'no-store',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });
    const tokenData = await tokenRes.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (!tokenData.access_token || !tokenData.refresh_token || !tokenData.expires_in) {
      logger.error({ tokenData }, '[Outlook OAuth] Token exchange failed');
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=token_exchange_failed`);
    }

    const userinfoRes = await fetch(USERINFO_URL, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userinfo = await userinfoRes.json() as { mail?: string | null; userPrincipalName?: string | null };
    const userEmail = userinfo.mail || userinfo.userPrincipalName;

    if (!userEmail) {
      logger.error({ userinfo }, '[Outlook OAuth] userinfo missing email');
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=no_email`);
    }

    if (!clerkOrgId) {
      logger.error('[Outlook OAuth] Missing org cookie , session likely interrupted');
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=server_error`);
    }
    const org = await db.organization.findUnique({ where: { clerkOrgId } });
    if (!org) {
      logger.error({ clerkOrgId }, '[Outlook OAuth] Org not found');
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=server_error`);
    }

    const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    await upsertExclusiveEmailIntegration({
      organizationId: org.id,
      externalAccountId: userEmail,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt,
      provider: 'outlook',
    });

    logger.info({ userEmail, orgId: org.id }, '[Outlook OAuth] Integration saved');
    const successUrl = returnTo
      ? `${appUrl}${returnTo}`
      : `${appUrl}/dashboard/integrations?connected=outlook`;
    return NextResponse.redirect(successUrl);

  } catch (err) {
    logger.error({ err }, '[Outlook OAuth] Unexpected error');
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=server_error`);
  }
}
