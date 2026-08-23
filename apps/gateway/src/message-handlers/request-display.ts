import { db } from '@shopkeeper/db';
import {
  parseClassifierSignals,
  type RequestFacts,
} from '@shopkeeper/agent/classifier-signals';
import { formatFactsBriefingLine } from '../maintenance/briefing-fields.js';
import { isRecord } from '../lib/typing.js';

export const REQUEST_DISPLAY_VERSION = 1 as const;
const ALIGNED_CLASSIFIER_VERSION = 5;
const DISPLAY_TOPIC_LIMIT = 120;
const REDACTED_ADDRESS = '[address redacted]';

export type SystemRequestKind = 'delivery_exception' | 'return_arrival';

export type RequestDisplay =
  | {
      version: typeof REQUEST_DISPLAY_VERSION;
      kind: 'classified';
      sourceMessageId: string;
      facts: RequestFacts;
      noRequest: boolean;
      topic: string | null;
    }
  | {
      version: typeof REQUEST_DISPLAY_VERSION;
      kind: 'system';
      event: SystemRequestKind;
    }
  | {
      version: typeof REQUEST_DISPLAY_VERSION;
      kind: 'unavailable';
    };

const SYSTEM_REQUEST_LINES: Record<SystemRequestKind, string> = {
  delivery_exception: 'System follow-up: a delivery exception needs review',
  return_arrival: 'System follow-up: a returned item arrived',
};

const ADDRESS_FIELD_KEYS = new Set([
  'address',
  'address1',
  'address2',
  'billing_address',
  'delivery_address',
  'mailing_address',
  'postal_address',
  'shipping_address',
  'street',
  'street1',
  'street2',
]);
const POSTAL_FIELD_KEYS = new Set(['postal', 'postal_code', 'postcode', 'zip', 'zip_code']);
const ADDRESS_OBJECT_KEYS = new Set([
  ...ADDRESS_FIELD_KEYS,
  'city',
  'country',
  'country_code',
  'province',
  'province_code',
  ...POSTAL_FIELD_KEYS,
]);

const STREET_ADDRESS = /\b\d{1,6}\s+[\p{L}0-9][\p{L}0-9.'-]*(?:\s+[\p{L}0-9][\p{L}0-9.'-]*){0,5}\s+(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|court|ct|way|place|pl|terrace|ter|highway|hwy)\b(?:\s*(?:#|apt|apartment|unit|suite)\s*[\p{L}0-9-]+)?/giu;
const POSTAL_CODE = /\b(?:\d{5}(?:-\d{4})?|[A-Z]\d[A-Z][ -]?\d[A-Z]\d)\b/gi;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scalarText(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  return text.length >= 3 ? text : null;
}

function addressParts(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    const normalized = key.toLowerCase();
    if (!ADDRESS_OBJECT_KEYS.has(normalized)) return [];
    const text = scalarText(entry);
    return text ? [text] : [];
  });
}

/**
 * Address values are discovered from structured tool input, never by guessing
 * which arbitrary prose fragment looks private. Composite values are emitted
 * before their parts so replacement cannot leave a shorter suffix behind.
 */
export function addressRedactionCandidates(
  rawToolCalls: readonly unknown[],
): string[] {
  const found = new Set<string>();

  const visit = (value: unknown, parentKey?: string): void => {
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, parentKey));
      return;
    }
    if (!isRecord(value)) return;

    const parts = addressParts(value);
    if (parts.length > 1) {
      found.add(parts.join(', '));
      found.add(parts.join(' '));
    }

    for (const [key, entry] of Object.entries(value)) {
      const normalized = key.toLowerCase();
      if (ADDRESS_FIELD_KEYS.has(normalized) || POSTAL_FIELD_KEYS.has(normalized)) {
        const text = scalarText(entry);
        if (text) found.add(text);
      }
      if (isRecord(entry) || Array.isArray(entry)) visit(entry, normalized);
      else if (parentKey && ADDRESS_FIELD_KEYS.has(parentKey)) {
        const text = scalarText(entry);
        if (text) found.add(text);
      }
    }
  };

  rawToolCalls.forEach((toolCall) => visit(isRecord(toolCall) ? toolCall.input : undefined));
  return [...found].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

export function redactPostalAddresses(
  text: string,
  rawToolCalls: readonly unknown[] = [],
): string {
  let redacted = text;
  for (const candidate of addressRedactionCandidates(rawToolCalls)) {
    redacted = redacted.replace(new RegExp(escapeRegExp(candidate), 'gi'), REDACTED_ADDRESS);
  }
  return redacted
    .replace(STREET_ADDRESS, REDACTED_ADDRESS)
    .replace(POSTAL_CODE, REDACTED_ADDRESS)
    .replace(new RegExp(`(?:${escapeRegExp(REDACTED_ADDRESS)}[\\s,;]*){2,}`, 'gi'), REDACTED_ADDRESS);
}

export function redactToolInputForDisplay(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactToolInputForDisplay);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    const normalized = key.toLowerCase();
    if (ADDRESS_OBJECT_KEYS.has(normalized)) return [key, REDACTED_ADDRESS];
    return [key, redactToolInputForDisplay(entry)];
  }));
}

function boundedTopic(text: string | null | undefined): string | null {
  const compact = text?.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.length > DISPLAY_TOPIC_LIMIT
    ? `${compact.slice(0, DISPLAY_TOPIC_LIMIT).trimEnd()}…`
    : compact;
}

function redactRequestFacts(
  facts: RequestFacts,
  rawToolCalls: readonly unknown[] = [],
): RequestFacts {
  return {
    ...facts,
    subject: facts.subject ? redactPostalAddresses(facts.subject, rawToolCalls) : null,
    deadlineText: facts.deadlineText
      ? redactPostalAddresses(facts.deadlineText, rawToolCalls)
      : null,
  };
}

export function systemRequestDisplay(event: SystemRequestKind): RequestDisplay {
  return { version: REQUEST_DISPLAY_VERSION, kind: 'system', event };
}

export function unavailableRequestDisplay(): RequestDisplay {
  return { version: REQUEST_DISPLAY_VERSION, kind: 'unavailable' };
}

export async function buildRequestDisplaySnapshot(params: {
  organizationId: string;
  threadId: string;
  sourceMessageId?: string | null;
  rawToolCalls?: readonly unknown[];
  systemEvent?: SystemRequestKind;
}): Promise<RequestDisplay> {
  if (params.systemEvent) return systemRequestDisplay(params.systemEvent);
  if (!params.sourceMessageId) return unavailableRequestDisplay();

  const thread = await db.thread.findFirst({
    where: { id: params.threadId, organizationId: params.organizationId },
    select: {
      requestSourceMessageId: true,
      classifierSignals: true,
      aiTitle: true,
    },
  });
  const signals = parseClassifierSignals(thread?.classifierSignals);
  if (
    !thread
    || thread.requestSourceMessageId !== params.sourceMessageId
    || signals?.version !== ALIGNED_CLASSIFIER_VERSION
  ) {
    return unavailableRequestDisplay();
  }

  const rawToolCalls = params.rawToolCalls ?? [];
  return {
    version: REQUEST_DISPLAY_VERSION,
    kind: 'classified',
    sourceMessageId: params.sourceMessageId,
    facts: redactRequestFacts(signals.requestFacts, rawToolCalls),
    noRequest: signals.intents.no_request,
    topic: boundedTopic(redactPostalAddresses(thread.aiTitle ?? '', rawToolCalls)),
  };
}

function readSystemRequestKind(value: unknown): SystemRequestKind | null {
  return value === 'delivery_exception' || value === 'return_arrival' ? value : null;
}

export function readRequestDisplay(value: unknown): RequestDisplay | undefined {
  if (!isRecord(value) || value.version !== REQUEST_DISPLAY_VERSION) return undefined;
  if (value.kind === 'system') {
    const event = readSystemRequestKind(value.event);
    return event ? systemRequestDisplay(event) : unavailableRequestDisplay();
  }
  if (value.kind === 'unavailable') return unavailableRequestDisplay();
  if (value.kind !== 'classified' || typeof value.sourceMessageId !== 'string') {
    return unavailableRequestDisplay();
  }
  const signals = parseClassifierSignals({
    version: ALIGNED_CLASSIFIER_VERSION,
    language: 'en',
    intents: { no_request: value.noRequest === true },
    requestFacts: value.facts,
  });
  if (!signals) return unavailableRequestDisplay();
  return {
    version: REQUEST_DISPLAY_VERSION,
    kind: 'classified',
    sourceMessageId: value.sourceMessageId,
    facts: redactRequestFacts(signals.requestFacts),
    noRequest: value.noRequest === true,
    topic: typeof value.topic === 'string' ? redactPostalAddresses(value.topic) : null,
  };
}

export function formatRequestDisplayLine(
  display: RequestDisplay | undefined,
  person: string | null,
  now = new Date(),
): string {
  if (!display || display.kind === 'unavailable') {
    return 'Request details unavailable — open the thread for the original message';
  }
  if (display.kind === 'system') return SYSTEM_REQUEST_LINES[display.event];
  return formatFactsBriefingLine(display.facts, person, now, {
    noRequest: display.noRequest,
    topic: display.topic,
  }) ?? 'Request details unavailable — open the thread for the original message';
}
