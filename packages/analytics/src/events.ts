export const EVENT_SOURCES = ['dashboard', 'gateway'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const ONBOARDING_STEPS = ['store', 'shopify', 'email', 'autonomy', 'plan'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const INTEGRATION_PLATFORMS = ['shopify', 'email', 'ig_dm', 'imessage'] as const;
export type IntegrationPlatform = (typeof INTEGRATION_PLATFORMS)[number];

export const INTEGRATION_FAILURE_CATEGORIES = [
  'access_denied',
  'invalid_callback',
  'invalid_credentials',
  'provider_unavailable',
  'rate_limited',
  'state_mismatch',
  'validation_failed',
  'unknown',
] as const;
export type IntegrationFailureCategory = (typeof INTEGRATION_FAILURE_CATEGORIES)[number];

export const MESSAGE_CHANNELS = [
  'ig_dm',
  'email',
  'tiktok',
  'shopify',
  'sms',
  'sms_agent',
  'dashboard_agent',
  'imessage',
] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const PLAN_SOURCES = ['generated', 'cached'] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];

export const PLAN_DECISIONS = ['approved', 'dismissed', 'regenerated'] as const;
export type PlanDecision = (typeof PLAN_DECISIONS)[number];

export const TOOL_NAMES = [
  'add_internal_note',
  'add_shopify_customer_note',
  'ask_operator',
  'cancel_order',
  'create_refund',
  'create_return',
  'create_shopify_order',
  'edit_shopify_order',
  'escalate_to_human',
  'get_order_by_name',
  'get_order_tracking',
  'get_shopify_customer',
  'get_shopify_orders',
  'get_support_stats',
  'issue_discount',
  'search_kb',
  'search_shopify_customers',
  'search_shopify_products',
  'send_email',
  'send_reply',
  'update_shopify_customer_info',
  'update_shopify_order_address',
  'update_thread_status',
  'update_thread_tag',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const TOOL_CATEGORIES = ['action', 'communication', 'internal', 'read'] as const;
export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export const ACTION_OUTCOMES = ['succeeded', 'blocked', 'failed'] as const;
export type ActionOutcome = (typeof ACTION_OUTCOMES)[number];

export const REPLY_SOURCES = ['manual', 'agent_approved', 'agent_automatic'] as const;
export type ReplySource = (typeof REPLY_SOURCES)[number];

export const SUBSCRIPTION_STATUSES = [
  'none',
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_PLANS = ['free', 'starter', 'pro'] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

declare const analyticsInsertIdBrand: unique symbol;
export type AnalyticsInsertId = string & { readonly [analyticsInsertIdBrand]: true };

type ProductEventBase = {
  organizationId: string;
  source: EventSource;
  insertId?: AnalyticsInsertId;
};

export type ProductEvent =
  | (ProductEventBase & { event: 'workspace_created' })
  | (ProductEventBase & { event: 'onboarding_step_completed'; step: OnboardingStep })
  | (ProductEventBase & { event: 'onboarding_completed' })
  | (ProductEventBase & { event: 'integration_connection_started'; platform: IntegrationPlatform })
  | (ProductEventBase & { event: 'integration_connection_completed'; platform: IntegrationPlatform })
  | (ProductEventBase & {
      event: 'integration_connection_failed';
      platform: IntegrationPlatform;
      failureCategory: IntegrationFailureCategory;
    })
  | (ProductEventBase & {
      event: 'inbound_message_processed';
      channel: MessageChannel;
      isFirstForWorkspace: boolean;
    })
  | (ProductEventBase & {
      event: 'agent_plan_generated';
      channel: MessageChannel;
      planSource: PlanSource;
      stepCount: number;
      generationMs: number;
      cacheHit: boolean;
    })
  | (ProductEventBase & {
      event: 'agent_plan_decided';
      decision: PlanDecision;
      channel: MessageChannel;
      changed: boolean;
    })
  | (ProductEventBase & {
      event: 'agent_action_completed';
      toolName: ToolName;
      toolCategory: ToolCategory;
      outcome: ActionOutcome;
    })
  | (ProductEventBase & {
      event: 'outbound_reply_sent';
      channel: MessageChannel;
      replySource: ReplySource;
    })
  | (ProductEventBase & {
      event: 'subscription_status_changed';
      previousStatus: SubscriptionStatus;
      newStatus: SubscriptionStatus;
      plan: SubscriptionPlan;
    })
  | (ProductEventBase & {
      event: 'workspace_activated';
      secondsSinceWorkspaceCreated: number;
      withinSevenDays: boolean;
    });

export type ProductEventName = ProductEvent['event'];

export type ProductEventProperties = Record<string, string | number | boolean>;
