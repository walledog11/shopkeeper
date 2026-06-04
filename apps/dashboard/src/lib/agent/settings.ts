import type { OrgSettings } from "@/types";

export type AutonomyTier = NonNullable<OrgSettings["autonomyTier"]>;

export const AGENT_SETTINGS_DEFAULTS: OrgSettings = {
  aiContext: "",
  brandVoice: "",
  sampleReplies: [],
  agentName: "Clerk",
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
  dailyLLMSpendCapUsd: null,
  blockCancellations: false,
  blockCustomLineItems: false,
  maxIterations: 10,
  replyLanguage: "auto",
  digestEnabled: false,
  digestFrequency: 'daily',
  digestHour: 8,
  digestSecondHour: 17,
  digestDays: 'every_day',
  digestTimezoneOffset: 0,
  businessHoursEnabled: false,
  businessHoursStart: 9,
  businessHoursEnd: 17,
  businessHoursDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  businessHoursTimezoneOffset: 0,
  autoAckMessage: "Thanks for reaching out! We're currently outside business hours and will get back to you soon.",
  spamFilterEnabled: true,
  autonomyTier: 'trusted',
};

export const TIER_DEFAULTS: Record<AutonomyTier, Partial<OrgSettings>> = {
  watch: {
    maxRefundAmount: 0,
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
    requireApprovalForActions: true,
  },
  trusted: {
    maxRefundAmount: 100,
    requireApprovalForActions: false,
  },
  broad: {
    maxRefundAmount: 250,
    requireApprovalForActions: false,
  },
  full: {
    maxRefundAmount: 1000,
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

export type AutoExecuteMode = NonNullable<OrgSettings["autoExecuteMode"]>;

// Effective auto-execute mode, migrating the legacy boolean `autoExecuteEnabled`
// (true → live, false/unset → off) for orgs that predate `autoExecuteMode`.
export function resolveAutoExecuteMode(settings: Partial<OrgSettings> | null | undefined): AutoExecuteMode {
  const mode = settings?.autoExecuteMode;
  if (mode === "off" || mode === "shadow" || mode === "live") return mode;
  return settings?.autoExecuteEnabled === true ? "live" : "off";
}

export function resolveAgentSettings(settings: Partial<OrgSettings> | null | undefined): OrgSettings {
  const base = settings ?? {};
  const requested = base.autonomyTier;
  const tier: AutonomyTier = requested && requested in TIER_DEFAULTS ? requested : 'guarded';
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
