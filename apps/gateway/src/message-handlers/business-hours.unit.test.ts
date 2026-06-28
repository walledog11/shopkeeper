import { describe, expect, it } from 'vitest';
// Deterministic business-hours unit coverage.
import {
  isWithinBusinessHours,
  resolveAgentSettings,
} from '@shopkeeper/agent/settings';

describe('business hours', () => {
  it('applies shared defaults and treats disabled hours as open', () => {
    const settings = resolveAgentSettings({});

    expect(settings.businessHoursEnabled).toBe(false);
    expect(settings.businessHoursDays).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    expect(settings.businessHoursStart).toBe(9);
    expect(settings.businessHoursEnd).toBe(17);
    expect(isWithinBusinessHours(settings, new Date('2026-06-03T20:00:00Z'))).toBe(true);
  });

  it('evaluates weekday hours in the configured timezone', () => {
    const settings = resolveAgentSettings({
      businessHoursEnabled: true,
      businessHoursDays: ['wed'],
      businessHoursStart: 9,
      businessHoursEnd: 17,
      businessHoursTimezone: 'UTC',
    });

    expect(isWithinBusinessHours(settings, new Date('2026-06-03T16:00:00Z'))).toBe(true);
    expect(isWithinBusinessHours(settings, new Date('2026-06-03T20:00:00Z'))).toBe(false);
  });

  it('supports the next-day portion of overnight windows', () => {
    const overnight = resolveAgentSettings({
      businessHoursEnabled: true,
      businessHoursDays: ['wed'],
      businessHoursStart: 22,
      businessHoursEnd: 6,
      businessHoursTimezone: 'UTC',
    });

    expect(isWithinBusinessHours(overnight, new Date('2026-06-03T23:00:00Z'))).toBe(true);
    expect(isWithinBusinessHours(overnight, new Date('2026-06-04T05:00:00Z'))).toBe(true);
    expect(isWithinBusinessHours(overnight, new Date('2026-06-04T07:00:00Z'))).toBe(false);
  });

  it('repairs malformed historical schedules before evaluating them', () => {
    const repaired = resolveAgentSettings({
      businessHoursEnabled: true,
      businessHoursDays: ['wed', 'noday'],
      businessHoursStart: '9',
      businessHoursEnd: 9,
      businessHoursTimezone: 'not-a-timezone',
    });

    expect(repaired.businessHoursDays).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    expect(repaired.businessHoursStart).toBe(9);
    expect(repaired.businessHoursEnd).toBe(17);
    expect(repaired.businessHoursTimezone).toBeUndefined();
    expect(isWithinBusinessHours(repaired, new Date('2026-06-03T16:00:00Z'))).toBe(true);
  });
});
