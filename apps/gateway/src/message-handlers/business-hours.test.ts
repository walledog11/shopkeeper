import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isWithinBusinessHours,
  resolveBusinessHoursSettings,
  type BusinessHoursSettings,
} from './business-hours.js';

const ENABLED_SETTINGS: BusinessHoursSettings = {
  businessHoursEnabled: true,
  businessHoursDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  businessHoursStart: 9,
  businessHoursEnd: 17,
  businessHoursTimezone: 'UTC',
  businessHoursTimezoneOffset: 0,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('business hours', () => {
  it('resolves the existing defaults and treats disabled hours as open', () => {
    const settings = resolveBusinessHoursSettings({});

    expect(settings).toEqual({
      businessHoursEnabled: false,
      businessHoursDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      businessHoursStart: 9,
      businessHoursEnd: 17,
      businessHoursTimezone: '',
      businessHoursTimezoneOffset: 0,
    });
    expect(isWithinBusinessHours(settings)).toBe(true);
  });

  it('evaluates weekday hours in the configured timezone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T16:00:00Z'));
    expect(isWithinBusinessHours(ENABLED_SETTINGS)).toBe(true);

    vi.setSystemTime(new Date('2026-06-03T20:00:00Z'));
    expect(isWithinBusinessHours(ENABLED_SETTINGS)).toBe(false);
  });

  it('supports business-hour windows that cross midnight', () => {
    vi.useFakeTimers();
    const overnight = {
      ...ENABLED_SETTINGS,
      businessHoursDays: ['wed'],
      businessHoursStart: 22,
      businessHoursEnd: 6,
    };

    vi.setSystemTime(new Date('2026-06-03T23:00:00Z'));
    expect(isWithinBusinessHours(overnight)).toBe(true);

    vi.setSystemTime(new Date('2026-06-03T12:00:00Z'));
    expect(isWithinBusinessHours(overnight)).toBe(false);
  });

  it('falls back to UTC evaluation for an invalid timezone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T16:00:00Z'));

    expect(isWithinBusinessHours({
      ...ENABLED_SETTINGS,
      businessHoursTimezone: 'not-a-timezone',
    })).toBe(true);
  });
});
