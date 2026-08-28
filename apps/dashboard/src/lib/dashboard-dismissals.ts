const NOTIFICATION_DISMISSALS_COOKIE = "sk_notification_dismissals"
const WORKFLOW_BANNER_DISMISSAL_COOKIE = "sk_workflow_banner_dismissed"
const WORKFLOW_BANNER_EXPANDED_COOKIE = "sk_workflow_banner_expanded"
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export {
  NOTIFICATION_DISMISSALS_COOKIE,
  WORKFLOW_BANNER_DISMISSAL_COOKIE,
  WORKFLOW_BANNER_EXPANDED_COOKIE,
}

export function parseDismissedNotificationIds(raw: string | undefined): Set<string> {
  if (!raw) return new Set()
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0))
  } catch {
    return new Set()
  }
}

function serializeDismissedNotificationIds(ids: Iterable<string>): string {
  return JSON.stringify([...ids])
}

export function readWorkflowBannerDismissed(raw: string | undefined): boolean {
  return raw === "true"
}

export function readWorkflowBannerExpanded(raw: string | undefined): boolean {
  return raw === "true"
}

function cookieAttributes(maxAgeSeconds: number): string {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : ""
  return `; path=/; max-age=${maxAgeSeconds}; SameSite=Lax${secure}`
}

export function writeDismissedNotificationIdsCookie(ids: Iterable<string>): void {
  document.cookie = `${NOTIFICATION_DISMISSALS_COOKIE}=${encodeURIComponent(
    serializeDismissedNotificationIds(ids),
  )}${cookieAttributes(ONE_YEAR_SECONDS)}`
}

export function writeWorkflowBannerDismissedCookie(): void {
  document.cookie = `${WORKFLOW_BANNER_DISMISSAL_COOKIE}=true${cookieAttributes(ONE_YEAR_SECONDS)}`
}

export function writeWorkflowBannerExpandedCookie(expanded: boolean): void {
  document.cookie = `${WORKFLOW_BANNER_EXPANDED_COOKIE}=${expanded ? "true" : "false"}${cookieAttributes(
    ONE_YEAR_SECONDS,
  )}`
}
