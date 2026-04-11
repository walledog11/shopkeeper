import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@clerk/db';
import logger from '@/lib/logger';

const FB_GRAPH = 'https://graph.facebook.com/v22.0';

export async function GET(request: Request) {
  const appUrl = process.env.APP_URL;
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appUrl || !appId || !appSecret) {
    return NextResponse.json({ error: 'OAuth callback is not configured' }, { status: 500 });
  }
  const redirectUri = `${appUrl}/api/integrations/instagram/callback`;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    logger.warn({ error }, '[IG OAuth] User denied access');
    return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=integrations&error=access_denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=integrations&error=invalid_callback`);
  }

  // Verify CSRF state
  const cookieStore = await cookies();
  const savedState = cookieStore.get('ig_oauth_state')?.value;
  const clerkOrgId = cookieStore.get('ig_oauth_org')?.value;
  const returnTo = cookieStore.get('ig_oauth_return')?.value;
  cookieStore.delete('ig_oauth_state');
  cookieStore.delete('ig_oauth_org');
  cookieStore.delete('ig_oauth_return');

  if (!savedState || savedState !== state) {
    logger.error('[IG OAuth] State mismatch — possible CSRF attempt');
    return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=integrations&error=state_mismatch`);
  }

  try {
    // ---------------------------------------------------------------
    // Step 1: Exchange code for a short-lived user access token
    // ---------------------------------------------------------------
    const tokenRes = await fetch(
      `${FB_GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      logger.error({ tokenData }, '[IG OAuth] Token exchange failed');
      return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=integrations&error=token_exchange_failed`);
    }
    const shortLivedToken: string = tokenData.access_token;

    // ---------------------------------------------------------------
    // Step 2: Upgrade to a long-lived user access token (60 days)
    // ---------------------------------------------------------------
    const longLivedRes = await fetch(
      `${FB_GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`
    );
    const longLivedData = await longLivedRes.json();
    const userToken: string = longLivedData.access_token || shortLivedToken;

    // ---------------------------------------------------------------
    // Step 3: Get pages the user manages with their linked IG accounts
    // Requires the user to have classic Page admin access (People with
    // Facebook access), not just Business Portfolio access.
    // ---------------------------------------------------------------
    const pagesRes = await fetch(
      `${FB_GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${userToken}`
    );
    const pagesData = await pagesRes.json();
    logger.info({ pagesData }, '[IG OAuth] /me/accounts response');

    const pages: Array<{
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string; username?: string };
    }> = pagesData.data || [];

    const igPage = pages.find((p) => p.instagram_business_account?.id);

    if (!igPage?.instagram_business_account) {
      logger.error('[IG OAuth] No Instagram Business account found');
      return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=integrations&error=no_ig_account`);
    }

    const pageToken = igPage.access_token;
    const pageId = igPage.id;
    const igAccountId = igPage.instagram_business_account.id;
    const igUsername = igPage.instagram_business_account.username || igAccountId;
    logger.info({ igUsername, igAccountId, pageId }, '[IG OAuth] Found Instagram account');

    // ---------------------------------------------------------------
    // Step 4: Subscribe to Instagram messaging webhooks
    // Must use the Facebook Page ID (not the IG account ID) per Meta docs.
    // ---------------------------------------------------------------
    const subscribeRes = await fetch(`${FB_GRAPH}/${pageId}/subscribed_apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscribed_fields: ['messages', 'messaging_postbacks'],
        access_token: pageToken,
      }),
    });
    const subscribeData = await subscribeRes.json();
    logger.info({ subscribeData }, '[IG OAuth] Webhook subscription');

    // ---------------------------------------------------------------
    // Step 5: Save integration to database
    // externalAccountId = Instagram Business Account ID
    //   (matches entry[0].id in Meta webhook payloads)
    // accessToken = Page Access Token (used for sending messages)
    // fromEmail   = Instagram @username (displayed in the UI)
    // ---------------------------------------------------------------
    if (!clerkOrgId) {
      logger.error('[IG OAuth] Missing org cookie — session likely interrupted');
      return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=integrations&error=server_error`);
    }
    const org = await db.organization.findUnique({ where: { clerkOrgId } });
    if (!org) {
      logger.error({ clerkOrgId }, '[IG OAuth] Org not found');
      return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=integrations&error=server_error`);
    }
    const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days
    const igCbKey = { organizationId: org.id, platform: 'ig_dm' as const, externalAccountId: igAccountId };
    const existingIgCb = await db.integration.findUnique({ where: { organizationId_platform_externalAccountId: igCbKey } });
    if (existingIgCb) {
      await db.integration.update({ where: { id: existingIgCb.id }, data: { accessToken: pageToken, fromEmail: igUsername, tokenExpiresAt } });
    } else {
      try {
        await db.integration.create({ data: { organizationId: org.id, platform: 'ig_dm', externalAccountId: igAccountId, accessToken: pageToken, fromEmail: igUsername, tokenExpiresAt } });
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
        const race = (await db.integration.findUnique({ where: { organizationId_platform_externalAccountId: igCbKey } }))!;
        await db.integration.update({ where: { id: race.id }, data: { accessToken: pageToken, fromEmail: igUsername, tokenExpiresAt } });
      }
    }

    logger.info({ igUsername, igAccountId, orgId: org.id }, '[IG OAuth] Integration saved');
    const successUrl = returnTo
      ? `${appUrl}${returnTo}`
      : `${appUrl}/dashboard/settings?tab=integrations&connected=instagram`;
    return NextResponse.redirect(successUrl);

  } catch (err) {
    logger.error({ err }, '[IG OAuth] Unexpected error');
    return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=integrations&error=server_error`);
  }
}
