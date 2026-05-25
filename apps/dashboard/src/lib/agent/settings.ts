import type { OrgSettings } from "@/types";

export const AGENT_SETTINGS_DEFAULTS: OrgSettings = {
  aiContext: "",
  brandVoice: "",
  sampleReplies: [],
  agentName: "Clerk",
  autoPlanOnOpen: true,
  alwaysDraftReply: false,
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

export function resolveAgentSettings(settings: Partial<OrgSettings> | null | undefined): OrgSettings {
  const base = settings ?? {};
  return {
    ...AGENT_SETTINGS_DEFAULTS,
    ...base,
    toolsEnabled: {
      ...AGENT_SETTINGS_DEFAULTS.toolsEnabled,
      ...(base.toolsEnabled ?? {}),
    },
  };
}
