import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';

const FB_GRAPH = 'https://graph.facebook.com/v19.0';

export async function GET(request: Request) {
  const appUrl = process.env.APP_URL!;
  const appId = process.env.META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;
  const redirectUri = `${appUrl}/api/integrations/instagram/callback`;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    console.warn('[IG OAuth] User denied access:', error);
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=access_denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=invalid_callback`);
  }

  // Verify CSRF state
  const cookieStore = await cookies();
  const savedState = cookieStore.get('ig_oauth_state')?.value;
  cookieStore.delete('ig_oauth_state');

  if (!savedState || savedState !== state) {
    console.error('[IG OAuth] State mismatch — possible CSRF attempt');
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=state_mismatch`);
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
      console.error('[IG OAuth] Token exchange failed:', tokenData);
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=token_exchange_failed`);
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
    console.log('[IG OAuth] /me/accounts response:', JSON.stringify(pagesData));

    const pages: Array<{
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string; username?: string };
    }> = pagesData.data || [];

    const igPage = pages.find((p) => p.instagram_business_account?.id);

    if (!igPage?.instagram_business_account) {
      console.error('[IG OAuth] No Instagram Business account found — user likely has Business Portfolio access only, not classic Page admin access.');
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=no_ig_account`);
    }

    const pageToken = igPage.access_token;
    const igAccountId = igPage.instagram_business_account.id;
    const igUsername = igPage.instagram_business_account.username || igAccountId;
    console.log('[IG OAuth] Found Instagram account:', igUsername, igAccountId);

    // ---------------------------------------------------------------
    // Step 4: Subscribe to Instagram messaging webhooks
    // ---------------------------------------------------------------
    const subscribeRes = await fetch(`${FB_GRAPH}/${igAccountId}/subscribed_apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscribed_fields: ['messages', 'messaging_postbacks'],
        access_token: pageToken,
      }),
    });
    const subscribeData = await subscribeRes.json();
    console.log('[IG OAuth] Webhook subscription:', JSON.stringify(subscribeData));

    // ---------------------------------------------------------------
    // Step 5: Save integration to database
    // externalAccountId = Instagram Business Account ID
    //   (matches entry[0].id in Meta webhook payloads)
    // accessToken = Page Access Token (used for sending messages)
    // fromEmail   = Instagram @username (displayed in the UI)
    // ---------------------------------------------------------------
    const org = await getOrCreateOrg();
    await db.integration.upsert({
      where: {
        organizationId_platform_externalAccountId: {
          organizationId: org.id,
          platform: 'ig_dm',
          externalAccountId: igAccountId,
        },
      },
      update: {
        accessToken: pageToken,
        fromEmail: igUsername,
      },
      create: {
        organizationId: org.id,
        platform: 'ig_dm',
        externalAccountId: igAccountId,
        accessToken: pageToken,
        fromEmail: igUsername,
      },
    });

    console.log(`[IG OAuth] Integration saved: @${igUsername} (${igAccountId}) for org ${org.id}`);
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?connected=instagram`);

  } catch (err) {
    console.error('[IG OAuth] Unexpected error:', err);
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=server_error`);
  }
}
