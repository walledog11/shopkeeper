import { NextResponse } from 'next/server';
import { getOrCreateOrg } from '@/lib/server/org';
import logger from '@/lib/server/logger';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import { captureIntegrationConnectionCompleted } from '@/lib/server/product-analytics';
import { upsertRaceSafeIntegration } from '@/app/api/integrations/_lib/integration-upsert';

const FB_GRAPH = 'https://graph.facebook.com/v22.0';

export async function GET(request: Request) {
  return createPostRedirectResponse(request, 'Connect Instagram');
}

export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

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
        `${FB_GRAPH}/${igAccountId}?fields=username&access_token=${pageAccessToken}`,
        { cache: 'no-store' }
      );
      const igData = await igRes.json();
      if (igData.username) accountName = igData.username;
    } catch (e) {
      logger.warn({ err: e }, '[IG Setup] Failed to fetch Instagram username');
    }

    const org = await getOrCreateOrg();
    const integration = await upsertRaceSafeIntegration({
      organizationId: org.id,
      platform: 'ig_dm',
      externalAccountId: igAccountId,
      data: { accessToken: pageAccessToken, fromEmail: accountName },
    });
    await captureIntegrationConnectionCompleted({
      integrationId: integration.id,
      organizationId: org.id,
      platform: 'ig_dm',
    });

    logger.info({ accountName, igAccountId, orgId: org.id }, '[IG Setup] Connected');
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?connected=instagram`);
  } catch (err) {
    logger.error({ err }, '[IG Setup] Failed');
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=server_error`);
  }
}
