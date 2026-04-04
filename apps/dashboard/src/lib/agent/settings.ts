import type { OrgSettings } from "@/types";

export const AGENT_SETTINGS_DEFAULTS: OrgSettings = {
  aiContext: "",
  brandVoice: "",
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
  blockCancellations: false,
  blockCustomLineItems: false,
  maxIterations: 10,
  replyLanguage: "auto",
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
