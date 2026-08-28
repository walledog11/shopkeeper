import { offsetToIanaFallback } from '@shopkeeper/agent/settings';
import { DIGEST_INTERVALS, WEEKDAY_INDEX } from './constants.js';

function normalizeHour(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return ((Math.round(value) % 24) + 24) % 24;
}

function resolveTz(settings: Record<string, unknown>): string {
  const tz = settings.digestTimezone;
  if (typeof tz === 'string' && tz.trim() !== '') return tz;
  const offset = typeof settings.digestTimezoneOffset === 'number'
    ? Math.round(settings.digestTimezoneOffset)
    : 0;
  return offsetToIanaFallback(offset);
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
  const timeZone = resolveTz(settings);
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

  const tz = resolveTz(settings);
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

// The agent says hello in its own name before reporting anything — the same
// voice `buildBindWelcome` and `buildFirstNightMessage` already use. Only the
// scheduled send greets; a merchant who just texted SUMMARY gets the answer.
export function buildDigestOpener(
  agentName: string,
  settings: Record<string, unknown>,
  now: Date,
  firstBriefing: boolean,
): string {
  const greeting = timeOfDayGreeting(localHourAndDay(resolveTz(settings), now).hour);
  return firstBriefing
    ? `${greeting}, ${agentName} here with your first rundown. You'll get one like this every day.`
    : `${greeting}, ${agentName} here.`;
}
