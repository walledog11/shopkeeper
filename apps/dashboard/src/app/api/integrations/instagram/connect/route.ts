import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';

const FB_GRAPH = 'https://graph.facebook.com/v19.0';

export async function GET() {
  const appUrl = process.env.APP_URL;
  const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
  const igAccountId = process.env.META_INSTAGRAM_ACCOUNT_ID;

  if (!appUrl || !pageAccessToken || !igAccountId) {
    return NextResponse.json(
      { error: 'Missing META_PAGE_ACCESS_TOKEN or META_INSTAGRAM_ACCOUNT_ID in env' },
      { status: 500 }
    );
  }

  try {
    // Fetch the Instagram username for display
    let accountName = igAccountId;
    try {
      const igRes = await fetch(
        `${FB_GRAPH}/${igAccountId}?fields=username&access_token=${pageAccessToken}`
      );
      const igData = await igRes.json();
      if (igData.username) accountName = igData.username;
    } catch (e) {
      console.warn('[IG Setup] Failed to fetch Instagram username:', e);
    }

    const org = await getOrCreateOrg();
    await db.integration.upsert({
      where: {
        organizationId_platform_externalAccountId: {
          organizationId: org.id,
          platform: 'ig_dm',
          externalAccountId: igAccountId,
        },
      },
      update: { accessToken: pageAccessToken, fromEmail: accountName },
      create: {
        organizationId: org.id,
        platform: 'ig_dm',
        externalAccountId: igAccountId,
        accessToken: pageAccessToken,
        fromEmail: accountName,
      },
    });

    console.log(`[IG Setup] Connected "@${accountName}" (${igAccountId}) for org ${org.id}`);
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?connected=instagram`);
  } catch (err) {
    console.error('[IG Setup] Failed:', err);
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=server_error`);
  }
}
