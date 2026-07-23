// Agent-domain types shared by the dashboard and the gateway worker. The
// dashboard's `@/types` re-exports these so existing call sites are unchanged.

// Settings stored as JSON on the Organization
export interface AgentToolPermissions {
  action: boolean;        // Shopify write ops: refund, cancel, update address, etc.
  communication: boolean; // send_reply
  internal: boolean;      // add_internal_note, update_thread_status, update_thread_tag
  read: boolean;          // get_shopify_customer, get_shopify_orders, get_order_by_name
}

export interface SampleReply {
  id: string;        // uuid, generated client-side
  body: string;      // ≤ 300 chars
  context?: string;  // optional 1-line "when to use" hint, e.g. "shipping delay"
  tag?: string;      // optional tag for matching against thread.tag
}

export type BusinessHoursDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface OrgSettings {
  // AI draft / summary
  aiContext: string;   // optional store details (policies, products) fed into AI drafts; business name comes from org.name
  brandVoice: string;  // tone brief appended to AI system prompt
  sampleReplies?: SampleReply[]; // merchant-supplied example replies the agent should imitate

  // Agent identity
  agentName: string;

  // Default behavior
  autoPlanOnOpen: boolean;
  autoExecuteMode?: 'off' | 'shadow' | 'live'; // off = approval-only; shadow = record counterfactuals, still approval-only; live = auto-fire
  defaultInstruction: string;

  // Tool permissions
  toolsEnabled: AgentToolPermissions;

  // Guardrails
  maxRefundAmount: number | null;  // per-call cap in USD; null = unlimited
  dailyRefundCap: number | null;   // cumulative org-wide cap in USD per UTC day; null = unlimited
  maxDiscountPercent: number | null; // per-call cap on issue_discount, 0–100; null = unlimited
  dailyLLMSpendCapUsd: number | null; // org-wide LLM spend cap per UTC day in USD; null = use DEFAULT_DAILY_LLM_SPEND_CAP_USD
  blockCancellations: boolean;
  blockCustomLineItems: boolean;
  maxIterations: number;

  // Response
  replyLanguage: string; // "auto" | ISO language name e.g. "English"

  // Operator digest (fanned out to bound Telegram/iMessage channels)
  digestEnabled: boolean;
  digestFrequency: 'daily' | 'twice_daily' | 'every_4h' | 'every_6h' | 'every_8h' | 'every_12h';
  digestHour: number;           // 0–23 local time — first (or only) send time
  digestSecondHour: number;     // 0–23 local time — second send time, only used for twice_daily
  digestDays: 'every_day' | 'weekdays';
  digestTimezone?: string;      // IANA tz, e.g. "America/New_York". Preferred.
  digestTimezoneOffset: number; // integer UTC offset (legacy fallback for orgs that haven't migrated)

  // Business hours
  businessHoursEnabled: boolean;
  businessHoursStart: number;          // 0–23 local hour open (inclusive)
  businessHoursEnd: number;            // 0–23 local hour close (exclusive)
  businessHoursDays: BusinessHoursDay[]; // selected days are opening days; overnight windows may end the next day
  businessHoursTimezone?: string;      // IANA tz. Preferred.
  businessHoursTimezoneOffset: number; // integer UTC offset (legacy fallback)
  autoAckMessage: string;

  // Spam filter
  spamFilterEnabled?: boolean;

  // Onboarding — chosen autonomy preset (see settings.ts mapping)
  autonomyTier?: 'watch' | 'guarded' | 'trusted' | 'broad' | 'full';

  // Onboarding — set when merchant completes the v1 onboarding flow
  onboardingCompletedAt?: string;

  // Onboarding — set when the first operator channel binds; makes the next
  // scheduled digest send a welcome briefing even when the inbox is empty,
  // then cleared by the digest worker.
  firstBriefingPending?: boolean;

  // ISO timestamp of the last successfully sent scheduled digest. Drives the
  // handled rollup window for morning briefing v2.
  lastSuccessfulDigestAt?: string;

  // Digest garnish — daily sales pulse (default on when Shopify is connected).
  salesPulseEnabled?: boolean;

  // Digest garnish — alert when variant inventory is at or below this count.
  // Omit or null to disable low-stock lines.
  lowStockThreshold?: number | null;

  // Proactive shipping monitor — watch USPS tracking for stalled shipments and
  // delivery exceptions. Requires DELIVERY_EXCEPTION_MONITOR_ENABLED on the gateway.
  deliveryExceptionWatchEnabled?: boolean;

  // Post-resolution follow-up (B5) — nudge the operator to check in a few days
  // after a refund/exchange ticket closes. Requires
  // POST_RESOLUTION_FOLLOWUP_MONITOR_ENABLED on the gateway.
  postResolutionFollowUpEnabled?: boolean;

  // Days a resolved ticket must have been closed before the follow-up nudge
  // fires. Omit for the default (5).
  postResolutionFollowUpDays?: number | null;
}

export type OrgSettingsPatch = Omit<Partial<OrgSettings>, 'toolsEnabled'> & {
  toolsEnabled?: Partial<AgentToolPermissions>;
};

// Agent plan — proposed steps before execution
export type ToolCategory = 'action' | 'communication' | 'internal' | 'read'

export interface RawToolCall {
  id: string
  name: string
  input: unknown
}

export interface PlanStep {
  id: string          // matches RawToolCall.id
  tool: string
  label: string
  description: string
  category: ToolCategory
  enabled: boolean
}

export type RoutingDecision = 'auto_execute' | 'needs_review' | 'escalate'

export interface AgentPlan {
  /** Stable internal analytics identifier for this cached plan version. */
  planId?: string
  instruction: string
  steps: PlanStep[]          // visible steps (reads excluded)
  rawToolCalls: RawToolCall[] // all tool calls including reads
  readResults?: Record<string, string> // tool_use.id → raw result string, for read-only tools
  warnings?: string[]
  /**
   * Phase 3 routing disposition: how the guards classified this plan without
   * mutating its tool calls. `classifyHomePlan` consumes this; `question` is the
   * merchant-facing prompt for a `needs_review` policy gap.
   */
  routing?: {
    decision: RoutingDecision
    signals?: string[]
    question?: string | null
  }
}

// Terminal result exposed to approval surfaces after a reviewed plan runs.
// `partial` is a presentation-level distinction: the durable ledger records it
// as failed, while the UI must still say that at least one action committed.
export type PlanExecutionOutcome = 'committed' | 'failed' | 'partial' | 'unknown'

// Agent turn in the notes tab
export interface AgentTurn {
  id?: string
  instruction: string
  actions: { tool: string; result: string; status?: 'success' | 'error' | 'policy_block' | 'escalated' | 'unknown' }[]
  summary: string | null
  error: string | null
  mode?: 'human_approved' | 'auto_executed' | 'read_only'
  senderPhone?: string | null
  clerkUserId?: string | null
}
