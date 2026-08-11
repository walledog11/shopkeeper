import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { readRequiredJsonObject } from '@/lib/api/body';
import { BadRequestError, ConflictError } from '@/lib/api/errors';
import { withInternalRoute } from '@/lib/api/internal-route';
import { cleanupIntegrationProvider } from '@/app/api/integrations/_lib/provider-cleanup';

export const POST = withInternalRoute(
  {
    context: 'Integration disconnect cleanup',
    errorMessage: 'Failed to clean up integration provider resources',
  },
  async ({ request }) => {
    const body = await readRequiredJsonObject(request);
    const operationId = typeof body.operationId === 'string' ? body.operationId.trim() : '';
    const claimToken = typeof body.claimToken === 'string' ? body.claimToken.trim() : '';
    if (!operationId || !claimToken) {
      throw new BadRequestError('operationId and claimToken are required');
    }

    const operation = await db.integrationDisconnect.findUnique({
      where: { id: operationId },
    });
    if (!operation) {
      return NextResponse.json({ error: 'Integration disconnect not found' }, { status: 404 });
    }
    if (operation.status !== 'processing' || operation.claimToken !== claimToken) {
      throw new ConflictError('Integration disconnect claim is no longer active');
    }
    if (operation.providerCleanedAt) {
      return NextResponse.json({ cleaned: true });
    }

    const integration = await db.integration.findFirst({
      where: {
        id: operation.integrationId,
        organizationId: operation.organizationId,
        lifecycleStatus: { in: ['disconnecting', 'cleanup_failed'] },
      },
    });
    if (!integration) {
      throw new ConflictError('Integration credentials are unavailable for provider cleanup');
    }
    await cleanupIntegrationProvider(integration);

    return NextResponse.json({ cleaned: true });
  },
);
