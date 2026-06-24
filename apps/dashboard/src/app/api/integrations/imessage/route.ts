import { NextResponse } from 'next/server';
import { ChannelType } from '@shopkeeper/db';
import { readRequiredJsonObject } from '@/lib/api/body';
import { BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { upsertRaceSafeIntegration } from '../_lib/integration-upsert';
import { buildPhotonWebhookUrl } from '../_lib/photon-webhook';

export const dynamic = 'force-dynamic';

// Connect an iMessage line via Photon's Spectrum. The merchant pastes their
// Spectrum project credentials; we store them on an Integration (encrypted at
// rest by the Prisma $extends) and hand back the per-org webhook URL to paste
// into Spectrum. projectId -> externalAccountId, projectSecret -> accessToken,
// webhookSecret -> refreshToken (matches what the gateway Spectrum factory reads).
export const POST = withOrgRoute(
  {
    context: 'iMessage integration POST',
    errorMessage: 'Failed to connect iMessage',
    requireBillingWriteAllowed: true,
    rateLimit: { key: 'integrations:imessage', limit: 20, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const body = await readRequiredJsonObject(request);
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
    const projectSecret = typeof body.projectSecret === 'string' ? body.projectSecret.trim() : '';
    const webhookSecret = typeof body.webhookSecret === 'string' ? body.webhookSecret.trim() : '';

    if (!projectId || !projectSecret || !webhookSecret) {
      throw new BadRequestError('projectId, projectSecret, and webhookSecret are required');
    }

    const integration = await upsertRaceSafeIntegration({
      organizationId: org.id,
      platform: ChannelType.imessage,
      externalAccountId: projectId,
      data: { accessToken: projectSecret, refreshToken: webhookSecret },
    });

    // Never echo the secrets back — return only safe fields plus the webhook URL.
    return NextResponse.json(
      {
        id: integration.id,
        platform: integration.platform,
        externalAccountId: integration.externalAccountId,
        createdAt: integration.createdAt,
        webhookUrl: buildPhotonWebhookUrl(integration.id),
      },
      { status: 201 },
    );
  },
);
