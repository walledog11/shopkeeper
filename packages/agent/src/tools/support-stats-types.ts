export const SUPPORT_STATS_DEFAULT_DAYS = 7;
export const SUPPORT_STATS_MAX_DAYS = 90;

export interface SupportStatsSummary {
  from: string;
  to: string;
  tickets: {
    total: number;
    byTag: Array<{ tag: string; count: number }>;
    byChannel: Array<{ channel: string; count: number }>;
    byDay: Array<{ day: string; count: number }>;
  };
  messages: { customer: number; agent: number; ai: number };
  resolution: { closedCount: number; avgMinutes: number | null };
}

export function clampSupportStatsDays(days: number | undefined): number {
  if (days === undefined) return SUPPORT_STATS_DEFAULT_DAYS;
  return Math.min(Math.max(Math.round(days), 1), SUPPORT_STATS_MAX_DAYS);
}
