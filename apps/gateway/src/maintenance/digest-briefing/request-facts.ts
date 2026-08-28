import { parseClassifierSignals, type RequestFacts } from '@shopkeeper/agent/classifier-signals';
import type { AskLessContext } from '../briefing-fields.js';
import { redactBriefingContacts } from './text.js';
import { REQUEST_FACTS_MIN_VERSION } from './constants.js';
import type { BriefingTicketRow } from './types.js';

/**
 * The structured fields for a row, when the classifier wrote them. Older rows
 * deliberately render as unavailable rather than reviving model-prose repair.
 */
export function rowRequestFacts(thread: { classifierSignals?: unknown }): RequestFacts | null {
  const signals = parseClassifierSignals(thread.classifierSignals);
  if (!signals || (signals.version ?? 0) < REQUEST_FACTS_MIN_VERSION) return null;
  return signals.requestFacts;
}

/** The classifier read a greeting or fragment: nothing has been asked yet. */
export function rowHasNoRequest(thread: { classifierSignals?: unknown }): boolean {
  return parseClassifierSignals(thread.classifierSignals)?.intents.no_request === true;
}

/**
 * What a row can still say when no ask was named. `aiTitle` is a bounded topic
 * field from the classifier, not a sentence to re-tense or otherwise repair.
 */
export function askLessTopic(aiTitle: string | null | undefined): string | null {
  const title = aiTitle?.trim();
  return title ? redactBriefingContacts(title) : null;
}

export function rowAskLess(thread: BriefingTicketRow): AskLessContext {
  return { noRequest: rowHasNoRequest(thread), topic: askLessTopic(thread.aiTitle) };
}
