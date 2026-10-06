import { BadRequestError } from '@/lib/api/errors';
import { requireJsonObject } from '@/lib/api/body';
import {
  normalizeStringArray,
  optionalBoolean,
  requireNonEmptyString,
} from '@/lib/api/validation';

export function parseSendMessageBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Validation failed' });
  const threadId = requireNonEmptyString(candidate.threadId, 'threadId', 'Missing threadId or text');
  const text = requireNonEmptyString(candidate.text, 'text', 'Missing threadId or text');
  const isNote = optionalBoolean(candidate.isNote, 'isNote') ?? false;
  const attachments = normalizeStringArray(candidate.attachments, 'attachments') ?? [];

  if (text.length > 4000) {
    throw new BadRequestError('Message too long');
  }

  return { threadId, text, isNote, attachments };
}

export function parseInternalSendMessageBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Validation failed' });
  return {
    threadId: requireNonEmptyString(candidate.threadId, 'threadId', 'Missing threadId or text'),
    text: requireNonEmptyString(candidate.text, 'text', 'Missing threadId or text'),
  };
}

export function parseAutoAckBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Validation failed' });
  // Absent means after hours: a gateway deployed before `handoff` existed sends none.
  const kind = candidate.kind ?? 'after_hours';
  if (kind !== 'after_hours' && kind !== 'handoff') {
    throw new BadRequestError('kind must be after_hours or handoff');
  }
  return {
    threadId: requireNonEmptyString(candidate.threadId, 'threadId', 'Missing threadId'),
    kind,
  };
}
