import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getRedis } from '@/lib/redis';

const PRESENCE_TTL = 20; // seconds — heartbeat must arrive within this window

function presenceKey(orgId: string, threadId: string): string {
  return `presence:${orgId}:${threadId}`;
}

export async function PUT(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: threadId } = await params;
  const now = Date.now();

  try {
    const client = getRedis();
    const key = presenceKey(orgId, threadId);
    await client.zadd(key, { gt: true }, { score: now, member: userId });
    await client.expire(key, PRESENCE_TTL * 4);
  } catch {}

  return NextResponse.json({ ok: true });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: threadId } = await params;
  const cutoff = Date.now() - PRESENCE_TTL * 1000;

  try {
    const client = getRedis();
    const key = presenceKey(orgId, threadId);
    const active = await client.zrange(key, cutoff, '+inf', { byScore: true });
    const count = active.filter(uid => uid !== userId).length;
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: threadId } = await params;

  try {
    const client = getRedis();
    await client.zrem(presenceKey(orgId, threadId), userId);
  } catch {}

  return NextResponse.json({ ok: true });
}
