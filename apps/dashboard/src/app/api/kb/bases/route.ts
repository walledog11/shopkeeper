import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';

export const POST = withOrgRoute(
  { context: 'KB bases POST', errorMessage: 'Failed to create knowledge base' },
  async ({ org, request }) => {
    const { name } = await request.json() as { name?: unknown };
    if (typeof name !== 'string' || !name.trim()) {
      throw new BadRequestError('name is required');
    }
    const kb = await db.knowledgeBase.create({
      data: { organizationId: org.id, name: name.trim(), source: 'user' },
      include: { articles: true },
    });
    return NextResponse.json({ knowledgeBase: kb }, { status: 201 });
  },
);
