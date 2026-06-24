import {
  BUSINESS_HOURS_DAYS,
  parseStoredOrgSettingsPatch,
} from "./settings-parser.js";
import type {
  BusinessHoursDay,
  OrgSettings,
  OrgSettingsPatch,
} from "./types.js";

export {
  OrgSettingsValidationError,
  parseOrgSettingsPatch,
  type OrgSettingsValidationIssue,
} from "./settings-parser.js";
export type { OrgSettingsPatch } from "./types.js";

export type AutonomyTier = NonNullable<OrgSettings["autonomyTier"]>;
export type AutoExecuteMode = NonNullable<OrgSettings["autoExecuteMode"]>;
export type BusinessHoursSettings = Pick<
  OrgSettings,
  | "businessHoursEnabled"
  | "businessHoursDays"
  | "businessHoursStart"
  | "businessHoursEnd"
  | "businessHoursTimezone"
  | "businessHoursTimezoneOffset"
>;

export const AGENT_SETTINGS_DEFAULTS: OrgSettings = {
  aiContext: "",
  brandVoice: "",
  sampleReplies: [],
  agentName: "Shopkeeper",
  autoPlanOnOpen: true,
  autoExecuteEnabled: false,
  defaultInstruction: "",
  requireApprovalForActions: true,
  toolsEnabled: {
    action: true,
    communication: true,
    internal: true,
    read: true,
  },
  maxRefundAmount: null,
  dailyRefundCap: null,
  maxDiscountPercent: null,
  dailyLLMSpendCapUsd: null,
  blockCancellations: false,
  blockCustomLineItems: false,
  maxIterations: 10,
  replyLanguage: "auto",
  digestEnabled: false,
  digestFrequency: "daily",
  digestHour: 8,
  digestSecondHour: 17,
  digestDays: "every_day",
  digestTimezoneOffset: 0,
  businessHoursEnabled: false,
  businessHoursStart: 9,
  businessHoursEnd: 17,
  businessHoursDays: ["mon", "tue", "wed", "thu", "fri"],
  businessHoursTimezoneOffset: 0,
  autoAckMessage: "Thanks for reaching out! We're currently outside business hours and will get back to you soon.",
  spamFilterEnabled: true,
  autonomyTier: "guarded",
};

export const TIER_DEFAULTS: Record<AutonomyTier, Partial<OrgSettings>> = {
  watch: {
    maxRefundAmount: 0,
    maxDiscountPercent: 0,
    requireApprovalForActions: true,
    toolsEnabled: {
      action: false,
      communication: false,
      internal: true,
      read: true,
    },
  },
  guarded: {
    maxRefundAmount: 50,
    maxDiscountPercent: 15,
    requireApprovalForActions: true,
  },
  trusted: {
    maxRefundAmount: 100,
    maxDiscountPercent: 20,
    requireApprovalForActions: false,
  },
  broad: {
    maxRefundAmount: 250,
    maxDiscountPercent: 30,
    requireApprovalForActions: false,
  },
  full: {
    maxRefundAmount: 1000,
    maxDiscountPercent: 50,
    requireApprovalForActions: false,
  },
};

// Tiers whose plans the classifier may surface as auto_execute, subject to
// per-call caps and other static policy checks.
export const TIERS_THAT_AUTO_EXECUTE: ReadonlySet<AutonomyTier> = new Set<AutonomyTier>([
  "trusted",
  "broad",
  "full",
]);

export function normalizeStoredOrgSettings(value: unknown): OrgSettingsPatch {
  const normalized = parseStoredOrgSettingsPatch(value);
  const start = normalized.businessHoursStart ?? AGENT_SETTINGS_DEFAULTS.businessHoursStart;
  const end = normalized.businessHoursEnd ?? AGENT_SETTINGS_DEFAULTS.businessHoursEnd;
  if (normalized.businessHoursEnabled === true && !isValidBusinessHoursWindow(start, end)) {
    delete normalized.businessHoursStart;
    delete normalized.businessHoursEnd;
  }
  return normalized;
}

// Effective auto-execute mode, migrating the legacy boolean `autoExecuteEnabled`
// (true -> live, false/unset -> off) for orgs that predate `autoExecuteMode`.
export function resolveAutoExecuteMode(settings: unknown): AutoExecuteMode {
  const normalized = normalizeStoredOrgSettings(settings);
  return normalized.autoExecuteMode ?? (normalized.autoExecuteEnabled ? "live" : "off");
}

export function resolveAgentSettings(settings: unknown): OrgSettings {
  const base = normalizeStoredOrgSettings(settings);
  const requested = base.autonomyTier;
  const tier: AutonomyTier = requested && requested in TIER_DEFAULTS ? requested : "guarded";
  const tierDefaults = TIER_DEFAULTS[tier];
  return {
    ...AGENT_SETTINGS_DEFAULTS,
    ...tierDefaults,
    ...base,
    autonomyTier: tier,
    toolsEnabled: {
      ...AGENT_SETTINGS_DEFAULTS.toolsEnabled,
      ...(tierDefaults.toolsEnabled ?? {}),
      ...(base.toolsEnabled ?? {}),
    },
  };
}

export function isValidBusinessHoursWindow(start: number, end: number): boolean {
  return start !== end;
}

function offsetToIanaFallback(offset: number): string {
  const rounded = Math.max(-12, Math.min(14, Math.round(offset)));
  if (rounded === 0) return "UTC";
  return `Etc/GMT${rounded > 0 ? "-" : "+"}${Math.abs(rounded)}`;
}

function localHourAndDay(timeZone: string, now: Date): { hour: number; day: BusinessHoursDay } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      weekday: "short",
      hour12: false,
    }).formatToParts(now);
    const rawHour = Number.parseInt(parts.find(part => part.type === "hour")?.value ?? "0", 10);
    const day = parts.find(part => part.type === "weekday")?.value.toLowerCase().slice(0, 3);
    return {
      hour: ((rawHour % 24) + 24) % 24,
      day: BUSINESS_HOURS_DAYS.includes(day as BusinessHoursDay) ? day as BusinessHoursDay : "sun",
    };
  } catch {
    return {
      hour: now.getUTCHours(),
      day: BUSINESS_HOURS_DAYS[now.getUTCDay() === 0 ? 6 : now.getUTCDay() - 1],
    };
  }
}

export function isWithinBusinessHours(settings: BusinessHoursSettings, now = new Date()): boolean {
  if (!settings.businessHoursEnabled) return true;
  if (!isValidBusinessHoursWindow(settings.businessHoursStart, settings.businessHoursEnd)) return false;

  const timezone = settings.businessHoursTimezone?.trim()
    ? settings.businessHoursTimezone
    : offsetToIanaFallback(settings.businessHoursTimezoneOffset);
  const { hour, day } = localHourAndDay(timezone, now);
  const dayIndex = BUSINESS_HOURS_DAYS.indexOf(day);
  const previousDay = BUSINESS_HOURS_DAYS[(dayIndex + BUSINESS_HOURS_DAYS.length - 1) % BUSINESS_HOURS_DAYS.length];

  if (settings.businessHoursStart < settings.businessHoursEnd) {
    return settings.businessHoursDays.includes(day)
      && hour >= settings.businessHoursStart
      && hour < settings.businessHoursEnd;
  }

  return (
    settings.businessHoursDays.includes(day) && hour >= settings.businessHoursStart
  ) || (
    settings.businessHoursDays.includes(previousDay) && hour < settings.businessHoursEnd
  );
}
