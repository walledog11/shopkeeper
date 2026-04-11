import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';

export async function GET() {
  try {
    const org = await getOrCreateOrg();
    const knowledgeBases = await db.knowledgeBase.findMany({
      where: { organizationId: org.id },
      include: { articles: { orderBy: { updatedAt: 'desc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ knowledgeBases });
  } catch (error) {
    return handleApiError(error, 'KB GET', 'Failed to fetch knowledge bases');
  }
}
