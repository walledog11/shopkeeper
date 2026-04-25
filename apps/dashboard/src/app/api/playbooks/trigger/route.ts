import { NextResponse } from 'next/server';
import { runPlaybooks } from '@/app/api/threads/_lib/playbook-runner';
import type { PlaybookTrigger } from '@/types';

export async function POST(request: Request) {
  const secret = request.headers.get('x-internal-secret');
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { organizationId, threadId, trigger } = await request.json() as {
    organizationId: string;
    threadId: string;
    trigger: PlaybookTrigger;
  };

  if (!organizationId || !threadId || !trigger?.type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Fire in background — caller doesn't need to wait
  runPlaybooks(organizationId, trigger, threadId);

  return NextResponse.json({ ok: true });
}
