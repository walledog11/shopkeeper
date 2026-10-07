import { NextResponse } from 'next/server';
import { withInternalRoute } from '@/lib/api/internal-route';
import { readRequiredJsonObject } from '@/lib/api/body';
import { BadRequestError } from '@/lib/api/errors';
import { processWorkspaceDeletion } from '@/lib/server/workspace-deletion';

export const POST = withInternalRoute(
  { context: 'Workspace deletion cleanup', errorMessage: 'Failed to delete workspace' },
  async ({ request }) => {
    const body = await readRequiredJsonObject(request);
    if (typeof body.operationId !== 'string' || typeof body.claimToken !== 'string') {
      throw new BadRequestError('operationId and claimToken are required');
    }
    const completed = await processWorkspaceDeletion(body.operationId, body.claimToken);
    return NextResponse.json({ completed });
  },
);
