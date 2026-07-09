// Shared iMessage connect UX helpers (onboarding + Integrations).

// The line is a phone number, so an `sms:` deep link pre-fills both the recipient
// and the connect code. Scanned with the iPhone camera, Messages opens ready to
// send — no hand-carrying the code across devices. Body uses `&` (not `?`) per iOS.
export function buildSmsDeepLink(handle: string, token: string): string {
  const number = handle.replace(/[^\d+]/g, "");
  return `sms:${number}&body=${encodeURIComponent(token)}`;
}

// A bound handle's label is usually a raw E.164 number (e.g. +19096622741). Pretty-
// print US/Canada numbers as +1 (909) 662-2741; leave names, emails, and anything
// that isn't purely phone characters untouched.
export function formatHandleLabel(label: string): string {
  if (/[^\d\s()+\-.]/.test(label)) return label;
  const digits = label.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const n = digits.slice(1);
    return `+1 (${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return label;
}
