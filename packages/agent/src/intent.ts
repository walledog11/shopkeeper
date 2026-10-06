import { isOperatorChannel } from "./thread-constants.js";

export { isOperatorChannel };

const CUSTOMER_MUTATIVE_PHRASES = [
  "cancel",
  "refund",
  "exchange",
  "return my order",
  "return the order",
  "return label",
  "chargeback",
  "dispute",
] as const;

function hasPhrase(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

export function hasCustomerMutativeIntent(text: string): boolean {
  const lower = text.toLowerCase();
  if (hasPhrase(lower, CUSTOMER_MUTATIVE_PHRASES)) return true;
  if (/\b(change|update|edit)\b/.test(lower) && /\b(address|shipping)\b/.test(lower)) return true;
  if (/\b(create|place|make)\b/.test(lower) && lower.includes("order")) return true;
  return false;
}

export function hasActionableMutativeIntent(...texts: string[]): boolean {
  return texts.some((text) => hasCustomerMutativeIntent(text));
}

export const SHIPPING_COVERAGE_QUESTION_RES: readonly RegExp[] = [
  /\b(do you|can you|will you|are you)\b[^.?!]{0,48}\b(ship|deliver|send)\b/,
  /\bship(?:ping|s)?\s+(?:to|internationally|worldwide|globally|outside|overseas)\b/,
  /\b(international|worldwide|global|overseas)\b[^.?!]{0,40}\b(ship|deliver|order|shopping|sales)\b/,
  /\bshopping\s+globally\b/,
  /\bship\s+to\s+[a-z]{3,}/i,
];

export const DISCOUNT_POLICY_QUESTION_RES: readonly RegExp[] = [
  /\b(student|military|first.?time|loyalty|bulk|volume)\s+discount\b/i,
  /\boffer\s+(any|a)\s+(student|bulk|volume)\s+discount\b/i,
];
