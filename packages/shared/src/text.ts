/**
 * Lower-cases a label so it can sit mid-sentence — "I'd refund $40" built from
 * the step label "Refund $40".
 *
 * Guarded on `[A-Z][a-z]` so an acronym opener keeps its own casing: "URL
 * expired" stays itself instead of reaching the merchant as "uRL expired". Two
 * unguarded copies once made the same label read one way on the operator card
 * and another elsewhere, so every package uses this one.
 */
export function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}
