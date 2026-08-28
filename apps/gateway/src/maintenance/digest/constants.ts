import { ONE_HOUR_MS } from '../registration.js';

export const FOUR_HOURS_MS = 4 * ONE_HOUR_MS;
export const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;

export const DIGEST_QUESTIONABLE_LIMIT = 10;
export const WEEKLY_SUMMARY_MIN_TICKETS = 3;
export const DIGEST_INTERVALS: Record<string, number> = {
  every_4h: 4,
  every_6h: 6,
  every_8h: 8,
  every_12h: 12,
};

export const DIGEST_WINDOW_SETTING = 'lastDigestWindow';

export const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};
