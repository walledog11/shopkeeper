import { NextResponse } from 'next/server';
import { getOrCreateOrg } from '@/lib/org';

export async function GET() {
  try {
    const org = await getOrCreateOrg();
    return NextResponse.json({ id: org.id, name: org.name });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch org' }, { status: 500 });
  }
}
