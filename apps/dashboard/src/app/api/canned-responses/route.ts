import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { readRequiredJsonObject } from '@/lib/api/body';
import { withOrgRoute } from '@/lib/api/route';
import { parseCreateCannedResponseBody } from '@/app/api/canned-responses/_lib/validation';

export const GET = withOrgRoute(
  { context: 'Canned Responses GET', errorMessage: 'Failed to fetch canned responses' },
  async ({ org }) => {
    const responses = await db.cannedResponse.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ responses });
  },
);

export const POST = withOrgRoute(
  { context: 'Canned Responses POST', errorMessage: 'Failed to create canned response' },
  async ({ org, request }) => {
    const { title, body, tags, channels } = parseCreateCannedResponseBody(await readRequiredJsonObject(request));
    const response = await db.cannedResponse.create({
      data: {
        organizationId: org.id,
        title,
        body,
        tags,
        channels,
      },
    });
    return NextResponse.json({ response }, { status: 201 });
  },
);
