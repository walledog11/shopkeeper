import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';

export async function GET() {
  try {
    const org = await getOrCreateOrg();

    const integrations = await db.integration.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(integrations);
  } catch (error) {
    return handleApiError(error, 'Integrations GET', 'Failed to fetch integrations');
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
    return handleApiError(error, 'Integrations POST', 'Failed to create integration');
  }
}
