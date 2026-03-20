import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';

export async function GET() {
  try {
    const org = await getOrCreateOrg();

    const integrations = await db.integration.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(integrations);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Integrations] GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch integrations' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { platform, externalAccountId, fromEmail } = await request.json();

    if (!platform || !externalAccountId) {
      return NextResponse.json({ error: 'Missing platform or externalAccountId' }, { status: 400 });
    }

    const integration = await db.integration.upsert({
      where: {
        organizationId_platform_externalAccountId: {
          organizationId: org.id,
          platform,
          externalAccountId,
        },
      },
      update: {
        ...(fromEmail !== undefined && { fromEmail }),
      },
      create: {
        organizationId: org.id,
        platform,
        externalAccountId,
        ...(fromEmail && { fromEmail }),
      },
    });

    return NextResponse.json(integration, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Integrations] POST failed:', error);
    return NextResponse.json({ error: 'Failed to create integration' }, { status: 500 });
  }
}
