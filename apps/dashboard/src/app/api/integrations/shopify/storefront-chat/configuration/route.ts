import { NextResponse } from 'next/server';
import { withOrgRoute } from '@/lib/api/route';
import { readRequiredJsonObject } from '@/lib/api/body';
import { loadChatConfiguration, publishChatConfiguration } from '@/lib/storefront-chat/service';

export const GET = withOrgRoute(
  { context: 'Chat configuration GET', errorMessage: 'Could not load chat settings.' },
  async ({ org }) => NextResponse.json(
    await loadChatConfiguration(org.id, org.name),
    { headers: { 'Cache-Control': 'private, no-store' } },
  ),
);

export const PUT = withOrgRoute(
  {
    context: 'Chat configuration PUT', errorMessage: 'Could not publish chat settings.',
    requireAdmin: true, requireBillingWriteAllowed: true,
    rateLimit: { key: 'storefront-chat:publish', limit: 30, windowSecs: 60 },
  },
  async ({ org, request }) => NextResponse.json(
    await publishChatConfiguration(org.id, await readRequiredJsonObject(request)),
  ),
);
