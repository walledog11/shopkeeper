import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@clerk/nextjs/server';
import { db } from '@clerk/db';
import logger from '@/lib/server/logger';
import { timingSafeIncludes } from '@/lib/auth-utils';
import { safeReturnTo } from '@/lib/security/safe-return-to';

const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const USERINFO_URL = 'https://graph.microsoft.com/v1.0/me';

export async function GET(request: Request) {
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

  const cookieStore = await cookies();
  const savedState = cookieStore.get('outlook_oauth_state')?.value;
  const clerkOrgId = cookieStore.get('outlook_oauth_org')?.value;
  const savedUserId = cookieStore.get('outlook_oauth_user')?.value;
  const returnTo = safeReturnTo(cookieStore.get('outlook_oauth_return')?.value);
  cookieStore.delete('outlook_oauth_state');
  cookieStore.delete('outlook_oauth_org');
  cookieStore.delete('outlook_oauth_user');
  cookieStore.delete('outlook_oauth_return');

  if (!savedState || !timingSafeIncludes([savedState], state)) {
    logger.error('[Outlook OAuth] State mismatch — possible CSRF attempt');
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=state_mismatch`);
  }

  const { userId: currentUserId } = await auth();
  if (!currentUserId || currentUserId !== savedUserId) {
    logger.error({ savedUserId, currentUserId }, '[Outlook OAuth] User session mismatch — possible CSRF attempt');
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=state_mismatch`);
  }

  try {
    const tokenRes = await fetch(TOKEN_URL, {
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
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userinfo = await userinfoRes.json() as { mail?: string | null; userPrincipalName?: string | null };
    const userEmail = userinfo.mail || userinfo.userPrincipalName;

    if (!userEmail) {
      logger.error({ userinfo }, '[Outlook OAuth] userinfo missing email');
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=no_email`);
    }

    if (!clerkOrgId) {
      logger.error('[Outlook OAuth] Missing org cookie — session likely interrupted');
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=server_error`);
    }
    const org = await db.organization.findUnique({ where: { clerkOrgId } });
    if (!org) {
      logger.error({ clerkOrgId }, '[Outlook OAuth] Org not found');
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=server_error`);
    }

    const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    const integrationData = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt,
      fromEmail: userEmail,
      metadata: { provider: 'outlook' as const },
    };
    const key = { organizationId: org.id, platform: 'email' as const, externalAccountId: userEmail };
    const existing = await db.integration.findUnique({ where: { organizationId_platform_externalAccountId: key } });
    let savedId: string;
    if (existing) {
      await db.integration.update({ where: { id: existing.id }, data: integrationData });
      savedId = existing.id;
    } else {
      try {
        const created = await db.integration.create({
          data: { organizationId: org.id, platform: 'email', externalAccountId: userEmail, ...integrationData },
        });
        savedId = created.id;
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
        const race = (await db.integration.findUnique({ where: { organizationId_platform_externalAccountId: key } }))!;
        await db.integration.update({ where: { id: race.id }, data: integrationData });
        savedId = race.id;
      }
    }

    await db.integration.deleteMany({
      where: { organizationId: org.id, platform: 'email', id: { not: savedId } },
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
