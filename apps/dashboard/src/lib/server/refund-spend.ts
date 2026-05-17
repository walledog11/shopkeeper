import { getRedis } from './redis';

const DAY_TTL_SECONDS = 36 * 60 * 60;

function dailyKey(orgId: string): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `refund-spend:${orgId}:${today}`;
}

export async function getDailyRefundSpendCents(orgId: string): Promise<number> {
  const raw = await getRedis().get<string | number>(dailyKey(orgId));
  if (raw == null) return 0;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export async function incrementDailyRefundSpendCents(orgId: string, cents: number): Promise<void> {
  const delta = Math.round(cents);
  if (!Number.isFinite(delta) || delta <= 0) return;
  const redis = getRedis();
  const key = dailyKey(orgId);
  const newTotal = await redis.incrby(key, delta);
  if (newTotal === delta) {
    await redis.expire(key, DAY_TTL_SECONDS);
  }
}
