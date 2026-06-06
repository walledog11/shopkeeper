import { BadRequestError } from '@/lib/api/errors';
import { requireJsonObject } from '@/lib/api/body';
import { optionalBoolean, optionalNonEmptyString, requireNonEmptyString } from '@/lib/api/validation';
import type { PlaybookAction, PlaybookActionType, PlaybookTrigger, PlaybookTriggerType } from '@/types';

const TRIGGER_TYPES = new Set<PlaybookTriggerType>(['new_ticket', 'tag_applied', 'ticket_closed']);
const ACTION_TYPES = new Set<PlaybookActionType>(['send_reply', 'apply_tag', 'close_ticket', 'add_note']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isTriggerType(value: unknown): value is PlaybookTriggerType {
  return typeof value === 'string' && TRIGGER_TYPES.has(value as PlaybookTriggerType);
}

function isActionType(value: unknown): value is PlaybookActionType {
  return typeof value === 'string' && ACTION_TYPES.has(value as PlaybookActionType);
}

export function parsePlaybookTrigger(value: unknown): PlaybookTrigger | null {
  if (!isRecord(value) || !isTriggerType(value.type)) return null;

  return {
    type: value.type,
    ...(typeof value.tag === 'string' ? { tag: value.tag } : {}),
  };
}

export function requirePlaybookTrigger(value: unknown): PlaybookTrigger {
  const trigger = parsePlaybookTrigger(value);
  if (!trigger) {
    throw new BadRequestError('Missing required fields');
  }
  return trigger;
}

function requirePlaybookTriggerObject(value: unknown, message: string): object {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof (value as { type?: unknown }).type !== 'string' ||
    !(value as { type: string }).type.trim()
  ) {
    throw new BadRequestError(message);
  }
  return value;
}

function normalizeActions(value: unknown): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestError('actions must be an array');
  }
  return value;
}

export function parseCreatePlaybookBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Invalid request body' });
  return {
    name: requireNonEmptyString(candidate.name, 'name'),
    trigger: requirePlaybookTriggerObject(candidate.trigger, 'trigger is required'),
    actions: normalizeActions(candidate.actions),
  };
}

export function parseUpdatePlaybookBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Invalid request body' });
  return {
    name: optionalNonEmptyString(candidate.name, 'name'),
    enabled: optionalBoolean(candidate.enabled, 'enabled'),
    trigger: candidate.trigger === undefined
      ? undefined
      : requirePlaybookTriggerObject(candidate.trigger, 'trigger must include a type'),
    actions: candidate.actions === undefined ? undefined : normalizeActions(candidate.actions),
  };
}

export function parseTriggerPlaybooksBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Missing required fields' });
  return {
    organizationId: requireNonEmptyString(candidate.organizationId, 'organizationId', 'Missing required fields'),
    threadId: requireNonEmptyString(candidate.threadId, 'threadId', 'Missing required fields'),
    trigger: requirePlaybookTrigger(candidate.trigger),
  };
}

function parsePlaybookAction(value: unknown): PlaybookAction | null {
  if (!isRecord(value) || !isActionType(value.type)) return null;

  return {
    type: value.type,
    ...(typeof value.message === 'string' ? { message: value.message } : {}),
    ...(typeof value.tag === 'string' ? { tag: value.tag } : {}),
    ...(typeof value.note === 'string' ? { note: value.note } : {}),
  };
}

export function parsePlaybookActions(value: unknown): PlaybookAction[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(parsePlaybookAction)
    .filter((action): action is PlaybookAction => action !== null);
}
