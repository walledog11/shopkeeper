export const DIGEST_CURSOR_KEY = 'lastSuccessfulDigestAt';

export const WAITING_PLAN_MIN_AGE_MS = 3 * 3_600_000;
export const DEFAULT_HANDLED_LOOKBACK_MS = 24 * 3_600_000;
export const NOTABLE_HANDLED_LIMIT = 5;

export const HANDOFF_VERBATIM_MAX = 120;
export const PHONE_LINE_MAX = 240;
export const FLAGGED_STRUCTURED_LINE_MAX = 140;
export const BRIEFING_RECITE_MAX = 8;

export const REQUEST_FACTS_MIN_VERSION = 5;

export const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'] as const;

export const KIND_ORDER = ['approval', 'decision', 'flagged'] as const;
