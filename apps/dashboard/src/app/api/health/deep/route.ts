import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { validateDashboardEnv } from '@/lib/env';
import logger from '@/lib/server/logger';
import { getRedis } from '@/lib/server/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, unknown> = {};
  let ok = true;

  try {
    validateDashboardEnv();
    checks.env = { status: 'ok' };
  } catch (error) {
    checks.env = { status: 'error' };
    ok = false;
    logger.error({ err: error }, '[Dashboard Health] Env validation failed');
  }

  try {
    await db.$queryRaw`SELECT 1`;
    checks.db = { status: 'ok' };
  } catch (error) {
    checks.db = { status: 'error' };
    ok = false;
    logger.error({ err: error }, '[Dashboard Health] DB check failed');
  }

  try {
    const pong = await getRedis().ping();
    checks.redis = { status: pong === 'PONG' ? 'ok' : 'error' };
    if (pong !== 'PONG') {
      ok = false;
    }
  } catch (error) {
    checks.redis = { status: 'error' };
    ok = false;
    logger.error({ err: error }, '[Dashboard Health] Redis check failed');
  }

  return NextResponse.json(
    { status: ok ? 'ok' : 'degraded', checks },
    { status: ok ? 200 : 503 },
  );
}
