import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';
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

    const currentSettings = (org.settings as OrgSettings | null) ?? {};

    const updated = await db.organization.update({
      where: { id: org.id },
      data: {
        ...(name !== undefined && { name }),
        ...(newSettings !== undefined && {
          settings: { ...currentSettings, ...newSettings },
        }),
      },
    });

    return NextResponse.json({ id: updated.id, name: updated.name, settings: updated.settings ?? {} });
  } catch (error) {
    return handleApiError(error, 'Org PATCH', 'Failed to update org');
  }
}
