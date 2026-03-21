import { NextResponse } from 'next/server';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';

export async function GET() {
  try {
    const org = await getOrCreateOrg();
    return NextResponse.json({ id: org.id, name: org.name });
  } catch (error) {
    return handleApiError(error, 'Org', 'Failed to fetch org');
  }
}
