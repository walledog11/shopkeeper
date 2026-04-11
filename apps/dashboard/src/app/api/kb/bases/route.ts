import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { name } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
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
