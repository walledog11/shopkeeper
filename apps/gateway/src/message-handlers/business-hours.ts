export interface BusinessHoursSettings {
  businessHoursEnabled: boolean;
  businessHoursDays: string[];
  businessHoursStart: number;
  businessHoursEnd: number;
  businessHoursTimezone: string;
  businessHoursTimezoneOffset: number;
}

const BUSINESS_HOURS_DEFAULTS: BusinessHoursSettings = {
  businessHoursEnabled: false,
  businessHoursDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  businessHoursStart: 9,
  businessHoursEnd: 17,
  businessHoursTimezone: '',
  businessHoursTimezoneOffset: 0,
};

function offsetToIanaFallback(offset: number): string {
  const rounded = Math.max(-12, Math.min(14, Math.round(offset)));
  if (rounded === 0) return 'UTC';
  return `Etc/GMT${rounded > 0 ? '-' : '+'}${Math.abs(rounded)}`;
}

export function resolveBusinessHoursSettings(raw: Record<string, unknown>): BusinessHoursSettings {
  const rawTimezone = raw.businessHoursTimezone;
  return {
    businessHoursEnabled: (raw.businessHoursEnabled as boolean) ?? BUSINESS_HOURS_DEFAULTS.businessHoursEnabled,
    businessHoursDays: (raw.businessHoursDays as string[]) ?? BUSINESS_HOURS_DEFAULTS.businessHoursDays,
    businessHoursStart: (raw.businessHoursStart as number) ?? BUSINESS_HOURS_DEFAULTS.businessHoursStart,
    businessHoursEnd: (raw.businessHoursEnd as number) ?? BUSINESS_HOURS_DEFAULTS.businessHoursEnd,
    businessHoursTimezone: typeof rawTimezone === 'string'
      ? rawTimezone
      : BUSINESS_HOURS_DEFAULTS.businessHoursTimezone,
    businessHoursTimezoneOffset: (raw.businessHoursTimezoneOffset as number)
      ?? BUSINESS_HOURS_DEFAULTS.businessHoursTimezoneOffset,
  };
}

export function isWithinBusinessHours(settings: BusinessHoursSettings): boolean {
  if (!settings.businessHoursEnabled) return true;

  const timezone = settings.businessHoursTimezone.trim() !== ''
    ? settings.businessHoursTimezone
    : offsetToIanaFallback(settings.businessHoursTimezoneOffset);

  const now = new Date();
  let localHour: number;
  let localDay: string;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      weekday: 'short',
      hour12: false,
    }).formatToParts(now);
    localHour = parseInt(parts.find((part) => part.type === 'hour')!.value, 10);
    localDay = parts.find((part) => part.type === 'weekday')!.value.toLowerCase().slice(0, 3);
  } catch {
    localHour = now.getUTCHours();
    localDay = now.toUTCString().slice(0, 3).toLowerCase();
  }

  const withinHours = settings.businessHoursEnd > settings.businessHoursStart
    ? localHour >= settings.businessHoursStart && localHour < settings.businessHoursEnd
    : localHour >= settings.businessHoursStart || localHour < settings.businessHoursEnd;

  return settings.businessHoursDays.includes(localDay) && withinHours;
}
