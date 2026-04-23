import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';

export async function GET() {
  try {
    const org = await getOrCreateOrg();
    const responses = await db.cannedResponse.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ responses });
  } catch (error) {
    return handleApiError(error, 'Canned Responses GET', 'Failed to fetch canned responses');
  }
}

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { title, body, tags, channels } = await request.json();
    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ error: 'title and body are required' }, { status: 400 });
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
  } catch (error) {
    return handleApiError(error, 'Canned Responses POST', 'Failed to create canned response');
  }
}
