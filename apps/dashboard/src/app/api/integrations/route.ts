import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit';
import { CHANNEL_TYPE } from '@/lib/messaging/thread-constants';

export async function GET() {
  try {
    const org = await getOrCreateOrg();

    const [integrations, activityRows] = await Promise.all([
      db.integration.findMany({
        where: { organizationId: org.id },
        orderBy: { createdAt: 'asc' },
      }),
      db.thread.groupBy({
        by: ['channelType'],
        where: { organizationId: org.id, deletedAt: null },
        _max: { updatedAt: true },
      }),
    ]);

    const lastActivityByChannel: Record<string, string | null> = {};
    for (const row of activityRows) {
      lastActivityByChannel[row.channelType] = row._max.updatedAt?.toISOString() ?? null;
    }

    const result = integrations.map(i => ({
      ...i,
      lastActivity: lastActivityByChannel[i.platform] ?? null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Integrations GET', 'Failed to fetch integrations');
  }
}

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const rl = await rateLimit(`integrations:create:${org.id}`, 20, 60);
    if (!rl.success) return tooManyRequests(rl.reset);
    const { platform, externalAccountId, fromEmail } = await request.json();

    if (!platform || !externalAccountId) {
      return NextResponse.json({ error: 'Missing platform or externalAccountId' }, { status: 400 });
    }

    if (!Object.values(CHANNEL_TYPE).includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    const uniqueKey = { organizationId: org.id, platform, externalAccountId };
    let existing = await db.integration.findUnique({
      where: { organizationId_platform_externalAccountId: uniqueKey },
    });
    let integration;
    if (existing) {
      integration = await db.integration.update({
        where: { id: existing.id },
        data: { ...(fromEmail !== undefined && { fromEmail }) },
      });
    } else {
      try {
        integration = await db.integration.create({
          data: { organizationId: org.id, platform, externalAccountId, ...(fromEmail && { fromEmail }) },
        });
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
        existing = (await db.integration.findUnique({ where: { organizationId_platform_externalAccountId: uniqueKey } }))!;
        integration = await db.integration.update({ where: { id: existing.id }, data: { ...(fromEmail !== undefined && { fromEmail }) } });
      }
    }

    return NextResponse.json(integration, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Integrations POST', 'Failed to create integration');
  }
}
