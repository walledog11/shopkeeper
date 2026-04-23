import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { clerkClient, auth } from '@clerk/nextjs/server';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';
import type { OrgSettings } from '@/types';

export async function GET() {
  try {
    const org = await getOrCreateOrg();
    return NextResponse.json({ id: org.id, name: org.name, settings: org.settings ?? {} });
  } catch (error) {
    return handleApiError(error, 'Org GET', 'Failed to fetch org');
  }
}

export async function PATCH(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const body = await request.json();
    const { name, settings: newSettings } = body as {
      name?: string;
      settings?: Partial<OrgSettings>;
    };

    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0 || name.length > 100)) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
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

    return NextResponse.json({ id: updated.id, name: updated.name, settings: updated.settings ?? {} });
  } catch (error) {
    return handleApiError(error, 'Org PATCH', 'Failed to update org');
  }
}
