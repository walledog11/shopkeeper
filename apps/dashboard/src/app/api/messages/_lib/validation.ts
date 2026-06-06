import { BadRequestError } from '@/lib/api/errors';
import { requireJsonObject } from '@/lib/api/body';
import { optionalBoolean, requireNonEmptyString } from '@/lib/api/validation';

export function parseSendMessageBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Validation failed' });
  const threadId = requireNonEmptyString(candidate.threadId, 'threadId', 'Missing threadId or text');
  const text = requireNonEmptyString(candidate.text, 'text', 'Missing threadId or text');
  const isNote = optionalBoolean(candidate.isNote, 'isNote') ?? false;

  if (text.length > 4000) {
    throw new BadRequestError('Message too long');
  }

  return { threadId, text, isNote };
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
  return {
    threadId: requireNonEmptyString(candidate.threadId, 'threadId', 'Missing threadId'),
  };
}
