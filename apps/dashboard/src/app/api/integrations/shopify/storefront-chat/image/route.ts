import { NextResponse } from 'next/server';
import { withOrgRoute } from '@/lib/api/route';
import { uploadChatPicture } from '@/lib/storefront-chat/service';

export const POST = withOrgRoute(
  {
    context: 'Chat picture POST', errorMessage: 'Could not upload your picture. Please try again.',
    requireAdmin: true, requireBillingWriteAllowed: true,
    rateLimit: { key: 'storefront-chat:picture', limit: 20, windowSecs: 60 },
  },
  async ({ org, request }) => NextResponse.json(await uploadChatPicture(org.id, request)),
);
