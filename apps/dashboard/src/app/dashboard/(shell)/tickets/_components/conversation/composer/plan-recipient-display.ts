function isEmailLike(value: string): boolean {
  return value.includes("@")
}

function truncateEmail(email: string, max = 28): string {
  if (email.length <= max) return email
  const at = email.indexOf("@")
  if (at <= 0) return `${email.slice(0, max - 1)}…`
  const local = email.slice(0, at)
  const domain = email.slice(at)
  const budget = max - domain.length - 1
  if (budget < 4) return `${email.slice(0, max - 1)}…`
  return `${local.slice(0, budget)}…${domain}`
}

export interface PlanRecipientDisplay {
  /** Short label for "drafted a reply to …" — omitted when the only identifier is an email. */
  headerTo: string | null
  /** Recipient line above the draft body. */
  draftTo: string
}

export function planRecipientDisplay(customerName?: string | null): PlanRecipientDisplay {
  const trimmed = customerName?.trim()
  if (!trimmed) {
    return { headerTo: null, draftTo: "Customer" }
  }

  if (isEmailLike(trimmed)) {
    return { headerTo: null, draftTo: truncateEmail(trimmed) }
  }

  const firstName = trimmed.split(/\s+/)[0] ?? trimmed
  return { headerTo: firstName, draftTo: firstName }
}
