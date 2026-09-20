import type {
  DbThreadFilterStatus,
  DbThreadRequestDisposition,
} from '@shopkeeper/db';
import {
  emptyIntents,
  type ClassifierIntents,
  type ClassifierTag,
  type RequestFacts,
} from '@shopkeeper/agent/classifier-signals';

// Structured intent signals produced alongside the title/summary/tag/filter.
// The intent vocabulary is owned by the agent core (`classifier-signals.ts`),
// which reads these back off the Thread when routing; re-exported here so the
// gateway's own call sites keep importing from this module.
export { emptyIntents, type ClassifierIntents };

export interface ClassificationResult {
  title: string;
  summary: string;
  tag: ClassifierTag;
  filterStatus: DbThreadFilterStatus;
  filterReason: string;
  intents: ClassifierIntents;
  language: string;
  requestSummary: string;
  requestDisposition: DbThreadRequestDisposition;
  requestFacts: RequestFacts;
}

// Bumped whenever the classifier's output contract changes so persisted
// signals can be interpreted against the schema that produced them.
export const CLASSIFIER_VERSION = 5;

export const CLASSIFIER_MAX_TOKENS = 700;

export function classifierSignals(result: ClassificationResult) {
  return {
    version: CLASSIFIER_VERSION,
    language: result.language,
    intents: result.intents,
    requestFacts: result.requestFacts,
  };
}
