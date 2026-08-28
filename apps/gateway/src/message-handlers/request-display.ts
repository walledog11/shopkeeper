import { db } from '@shopkeeper/db';
import {
  parseClassifierSignals,
  type RequestFacts,
} from '@shopkeeper/agent/classifier-signals';
import { formatFactsBriefingLine } from '../maintenance/briefing-fields.js';
import { isRecord } from '../lib/typing.js';

const REQUEST_DISPLAY_VERSION = 1 as const;
const ALIGNED_CLASSIFIER_VERSION = 5;
const DISPLAY_TOPIC_LIMIT = 120;

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

function boundedTopic(text: string | null | undefined): string | null {
  const compact = text?.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.length > DISPLAY_TOPIC_LIMIT
    ? `${compact.slice(0, DISPLAY_TOPIC_LIMIT).trimEnd()}…`
    : compact;
}

export function systemRequestDisplay(event: SystemRequestKind): RequestDisplay {
  return { version: REQUEST_DISPLAY_VERSION, kind: 'system', event };
}

export function unavailableRequestDisplay(): RequestDisplay {
  return { version: REQUEST_DISPLAY_VERSION, kind: 'unavailable' };
}

/**
 * Whether an immutable request snapshot contains enough grounded context for a
 * merchant decision. A syntactically valid `classified` snapshot may still be
 * empty, so checking only its discriminator would keep a blind approval live.
 */
export function requestDisplayHasContext(
  display: RequestDisplay | undefined,
  now = new Date(),
): boolean {
  if (!display || display.kind === 'unavailable') return false;
  if (display.kind === 'system') return true;
  return formatFactsBriefingLine(display.facts, null, now, {
    noRequest: display.noRequest,
    topic: display.topic,
  }) !== null;
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

  return {
    version: REQUEST_DISPLAY_VERSION,
    kind: 'classified',
    sourceMessageId: params.sourceMessageId,
    facts: signals.requestFacts,
    noRequest: signals.intents.no_request,
    topic: boundedTopic(thread.aiTitle),
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
    facts: signals.requestFacts,
    noRequest: value.noRequest === true,
    topic: typeof value.topic === 'string' ? boundedTopic(value.topic) : null,
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
