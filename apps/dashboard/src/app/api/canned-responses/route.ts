import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';

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
    const { title, body, tags, channels } = await request.json();
    if (!title?.trim() || !body?.trim()) {
      throw new BadRequestError('title and body are required');
    }
    const response = await db.cannedResponse.create({
      data: {
        organizationId: org.id,
        title: title.trim(),
        body: body.trim(),
        tags: Array.isArray(tags) ? tags.map((t: string) => t.trim()).filter(Boolean) : [],
        channels: Array.isArray(channels) ? channels.map((c: string) => c.trim()).filter(Boolean) : [],
      },
    });
    return NextResponse.json({ response }, { status: 201 });
  },
);
