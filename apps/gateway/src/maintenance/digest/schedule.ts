import { storeTimeZone } from '@shopkeeper/agent/settings';
import { DIGEST_INTERVALS, WEEKDAY_INDEX } from './constants.js';

function normalizeHour(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return ((Math.round(value) % 24) + 24) % 24;
}

function localHourAndDay(timeZone: string, now: Date): { hour: number; day: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      weekday: 'short',
      hour12: false,
    }).formatToParts(now);
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
    return {
      hour: ((parseInt(hourStr, 10) % 24) + 24) % 24,
      day: WEEKDAY_INDEX[weekday] ?? 0,
    };
  } catch {
    // Invalid timeZone — fall back to UTC.
    return { hour: now.getUTCHours(), day: now.getUTCDay() };
  }
}

/**
 * The send window a moment belongs to, in the merchant's own timezone — local
 * date plus local hour, because `shouldSendDigest` fires on a local hour and
 * every supported frequency puts its sends in distinct hours.
 */
export function digestWindowKey(settings: Record<string, unknown>, now: Date): string {
  const timeZone = storeTimeZone(settings);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    // Some ICU builds render midnight as hour 24 under hour12: false.
    const hour = ((parseInt(part('hour'), 10) % 24) + 24) % 24;
    return `${part('year')}-${part('month')}-${part('day')}T${String(hour).padStart(2, '0')}`;
  } catch {
    // Invalid timeZone — fall back to UTC, as localHourAndDay does.
    return now.toISOString().slice(0, 13);
  }
}

export function shouldSendDigest(
  settings: Record<string, unknown>,
  nowMs: number,
): boolean {
  const frequency = typeof settings.digestFrequency === 'string' ? settings.digestFrequency : 'daily';
  const firstHour = normalizeHour(settings.digestHour, 8);
  const secondHour = normalizeHour(settings.digestSecondHour, 17);
  const days = typeof settings.digestDays === 'string' ? settings.digestDays : 'every_day';

  const tz = storeTimeZone(settings);
  const { hour: localHour, day: localDay } = localHourAndDay(tz, new Date(nowMs));

  if (days === 'weekdays' && (localDay === 0 || localDay === 6)) return false;

  if (frequency === 'daily') return localHour === firstHour;
  if (frequency === 'twice_daily') return localHour === firstHour || localHour === secondHour;

  const interval = DIGEST_INTERVALS[frequency];
  if (!interval) return false;

  return ((localHour - firstHour + 24) % 24) % interval === 0;
}

function timeOfDayGreeting(localHour: number): string {
  if (localHour < 12) return 'Morning';
  if (localHour < 17) return 'Afternoon';
  return 'Evening';
}

// How often the merchant chose to hear from the agent, for the first briefing.
function briefingCadence(settings: Record<string, unknown>): string {
  const weekdays = settings.digestDays === 'weekdays';
  const frequency = typeof settings.digestFrequency === 'string' ? settings.digestFrequency : 'daily';
  if (frequency === 'twice_daily') return weekdays ? 'twice every weekday' : 'twice a day';
  const interval = DIGEST_INTERVALS[frequency];
  if (interval) return `every ${interval} hours${weekdays ? ' on weekdays' : ''}`;
  return weekdays ? 'every weekday' : 'every day';
}

// Introduce the agent once. Routine briefings start with a simple greeting;
// an on-demand SUMMARY goes straight to the answer.
export function buildDigestOpener(
  agentName: string,
  settings: Record<string, unknown>,
  now: Date,
  firstBriefing: boolean,
): string {
  const greeting = timeOfDayGreeting(localHourAndDay(storeTimeZone(settings), now).hour);
  return firstBriefing
    ? `${greeting}, ${agentName} here with your first rundown. You'll get one like this ${briefingCadence(settings)}.`
    : `${greeting}!`;
}
