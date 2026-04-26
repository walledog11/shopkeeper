import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { BadRequestError, handleApiError } from '@/lib/api/errors';

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { name } = await request.json() as { name?: unknown };
    if (typeof name !== 'string' || !name.trim()) {
      throw new BadRequestError('name is required');
    }
    const kb = await db.knowledgeBase.create({
      data: { organizationId: org.id, name: name.trim(), source: 'user' },
      include: { articles: true },
    });
    return NextResponse.json({ knowledgeBase: kb }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'KB bases POST', 'Failed to create knowledge base');
  }
}
