import {
  ACTION_OUTCOMES,
  EVENT_SOURCES,
  INTEGRATION_FAILURE_CATEGORIES,
  INTEGRATION_PLATFORMS,
  MESSAGE_CHANNELS,
  ONBOARDING_STEPS,
  PLAN_DECISIONS,
  PLAN_SOURCES,
  REPLY_SOURCES,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  TOOL_CATEGORIES,
  TOOL_NAMES,
  type AnalyticsInsertId,
  type ProductEvent,
  type ProductEventProperties,
} from './events.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INSERT_ID_PATTERN = /^[A-Za-z0-9._:%-]{1,200}$/;

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Product analytics event must be an object');
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function requireEnum<const T extends readonly string[]>(
  value: unknown,
  name: string,
  allowed: T,
): T[number] {
  const candidate = requireString(value, name);
  if (!(allowed as readonly string[]).includes(candidate)) {
    throw new TypeError(`${name} is not allowed`);
  }
  return candidate as T[number];
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${name} must be a boolean`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return value as number;
}

function requireOrganizationId(value: unknown): string {
  const organizationId = requireString(value, 'organizationId');
  if (!UUID_PATTERN.test(organizationId)) {
    throw new TypeError('organizationId must be an internal UUID');
  }
  return organizationId;
}

function optionalInsertId(value: unknown): AnalyticsInsertId | undefined {
  if (value === undefined) return undefined;
  const insertId = requireString(value, 'insertId');
  if (!INSERT_ID_PATTERN.test(insertId)) {
    throw new TypeError('insertId must contain only safe identifier characters');
  }
  return insertId as AnalyticsInsertId;
}

function baseEvent(input: Record<string, unknown>) {
  return {
    organizationId: requireOrganizationId(input.organizationId),
    source: requireEnum(input.source, 'source', EVENT_SOURCES),
    ...(input.insertId === undefined ? {} : { insertId: optionalInsertId(input.insertId) }),
  };
}

export function sanitizeProductEvent(value: unknown): ProductEvent {
  const input = requireRecord(value);
  const event = requireString(input.event, 'event');
  const base = baseEvent(input);

  switch (event) {
    case 'workspace_created':
    case 'onboarding_completed':
      return { ...base, event };
    case 'onboarding_step_completed':
      return { ...base, event, step: requireEnum(input.step, 'step', ONBOARDING_STEPS) };
    case 'integration_connection_started':
    case 'integration_connection_completed':
      return { ...base, event, platform: requireEnum(input.platform, 'platform', INTEGRATION_PLATFORMS) };
    case 'integration_connection_failed':
      return {
        ...base,
        event,
        platform: requireEnum(input.platform, 'platform', INTEGRATION_PLATFORMS),
        failureCategory: requireEnum(
          input.failureCategory,
          'failureCategory',
          INTEGRATION_FAILURE_CATEGORIES,
        ),
      };
    case 'inbound_message_processed':
      return {
        ...base,
        event,
        channel: requireEnum(input.channel, 'channel', MESSAGE_CHANNELS),
        isFirstForWorkspace: requireBoolean(input.isFirstForWorkspace, 'isFirstForWorkspace'),
      };
    case 'agent_plan_generated':
      return {
        ...base,
        event,
        channel: requireEnum(input.channel, 'channel', MESSAGE_CHANNELS),
        planSource: requireEnum(input.planSource, 'planSource', PLAN_SOURCES),
        stepCount: requireNonNegativeInteger(input.stepCount, 'stepCount'),
        generationMs: requireNonNegativeInteger(input.generationMs, 'generationMs'),
        cacheHit: requireBoolean(input.cacheHit, 'cacheHit'),
      };
    case 'agent_plan_decided':
      return {
        ...base,
        event,
        decision: requireEnum(input.decision, 'decision', PLAN_DECISIONS),
        channel: requireEnum(input.channel, 'channel', MESSAGE_CHANNELS),
        changed: requireBoolean(input.changed, 'changed'),
      };
    case 'agent_action_completed':
      return {
        ...base,
        event,
        toolName: requireEnum(input.toolName, 'toolName', TOOL_NAMES),
        toolCategory: requireEnum(input.toolCategory, 'toolCategory', TOOL_CATEGORIES),
        outcome: requireEnum(input.outcome, 'outcome', ACTION_OUTCOMES),
      };
    case 'outbound_reply_sent':
      return {
        ...base,
        event,
        channel: requireEnum(input.channel, 'channel', MESSAGE_CHANNELS),
        replySource: requireEnum(input.replySource, 'replySource', REPLY_SOURCES),
      };
    case 'subscription_status_changed':
      return {
        ...base,
        event,
        previousStatus: requireEnum(input.previousStatus, 'previousStatus', SUBSCRIPTION_STATUSES),
        newStatus: requireEnum(input.newStatus, 'newStatus', SUBSCRIPTION_STATUSES),
        plan: requireEnum(input.plan, 'plan', SUBSCRIPTION_PLANS),
      };
    case 'workspace_activated':
      return {
        ...base,
        event,
        secondsSinceWorkspaceCreated: requireNonNegativeInteger(
          input.secondsSinceWorkspaceCreated,
          'secondsSinceWorkspaceCreated',
        ),
        withinSevenDays: requireBoolean(input.withinSevenDays, 'withinSevenDays'),
      };
    default:
      throw new TypeError('Unknown product analytics event');
  }
}

export function getEventProperties(event: ProductEvent): ProductEventProperties {
  switch (event.event) {
    case 'workspace_created':
    case 'onboarding_completed':
      return {};
    case 'onboarding_step_completed':
      return { step: event.step };
    case 'integration_connection_started':
    case 'integration_connection_completed':
      return { platform: event.platform };
    case 'integration_connection_failed':
      return { platform: event.platform, failure_category: event.failureCategory };
    case 'inbound_message_processed':
      return { channel: event.channel, is_first_for_workspace: event.isFirstForWorkspace };
    case 'agent_plan_generated':
      return {
        channel: event.channel,
        plan_source: event.planSource,
        step_count: event.stepCount,
        generation_ms: event.generationMs,
        cache_hit: event.cacheHit,
      };
    case 'agent_plan_decided':
      return { decision: event.decision, channel: event.channel, changed: event.changed };
    case 'agent_action_completed':
      return {
        tool_name: event.toolName,
        tool_category: event.toolCategory,
        outcome: event.outcome,
      };
    case 'outbound_reply_sent':
      return { channel: event.channel, reply_source: event.replySource };
    case 'subscription_status_changed':
      return {
        previous_status: event.previousStatus,
        new_status: event.newStatus,
        plan: event.plan,
      };
    case 'workspace_activated':
      return {
        seconds_since_workspace_created: event.secondsSinceWorkspaceCreated,
        within_seven_days: event.withinSevenDays,
      };
  }
}
