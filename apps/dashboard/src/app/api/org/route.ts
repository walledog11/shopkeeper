import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { clerkClient, auth } from '@clerk/nextjs/server';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';
import { assertBillingWriteAllowed } from '@/lib/billing/write-gate';
import type { OrgSettings } from '@/types';

function resolvePlanName(priceId: string | null): string {
  if (!priceId) return 'Free';
  if (priceId === process.env.PRICE_ID_STARTER) return 'Starter';
  if (priceId === process.env.PRICE_ID_PRO || priceId === process.env.PRICE_ID) return 'Pro';
  return 'Paid';
}

export async function GET() {
  try {
    const org = await getOrCreateOrg();
    return NextResponse.json({
      id: org.id,
      name: org.name,
      settings: org.settings ?? {},
      version: org.updatedAt.toISOString(),
      planName: resolvePlanName(org.stripePriceId),
      stripeStatus: org.stripeStatus,
    });
  } catch (error) {
    return handleApiError(error, 'Org GET', 'Failed to fetch org');
  }
}

export async function PATCH(request: Request) {
  try {
    const org = await getOrCreateOrg();
    assertBillingWriteAllowed(org);
    const body = await request.json();
    const { name, settings: newSettings, version } = body as {
      name?: string;
      settings?: Partial<OrgSettings>;
      version?: string;
    };

    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0 || name.length > 100)) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
    }

    if (version !== undefined && version !== org.updatedAt.toISOString()) {
      return NextResponse.json(
        {
          error: 'stale_version',
          message: 'Settings were updated elsewhere. Reload to see the latest values.',
          current: {
            id: org.id,
            name: org.name,
            settings: org.settings ?? {},
            version: org.updatedAt.toISOString(),
          },
        },
        { status: 409 },
      );
    }

    const currentSettings = (org.settings as OrgSettings | null) ?? {};

    const updated = await db.organization.update({
      where: { id: org.id },
      data: {
        ...(name !== undefined && { name }),
        ...(newSettings !== undefined && {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          settings: JSON.parse(JSON.stringify({ ...currentSettings, ...newSettings })) as any,
        }),
      },
    });

    // Keep Clerk org name in sync so the sidebar switcher shows the same name
    if (name !== undefined) {
      const { orgId } = await auth();
      if (orgId) {
        const client = await clerkClient();
        await client.organizations.updateOrganization(orgId, { name });
      }
    }

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      settings: updated.settings ?? {},
      version: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error, 'Org PATCH', 'Failed to update org');
  }
}
