import { BadRequestError } from '@/lib/api/errors';
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
