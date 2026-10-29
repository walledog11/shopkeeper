type ClerkApiError = {
  errors?: Array<{ longMessage?: string; message?: string }>
}

export function passwordStatusLabel(passwordEnabled: boolean): string {
  return passwordEnabled
    ? "Password is set for this account."
    : "No password yet. Set one to also sign in with email."
}

export function isClerkAccountOverviewHash(hash: string): boolean {
  const path = hash.replace(/^#/, "").replace(/^\/+|\/+$/g, "")
  return path === "" || path === "account"
}

export function passwordUpdateError({
  confirmPassword,
  currentPassword,
  newPassword,
  passwordEnabled,
}: {
  confirmPassword: string
  currentPassword: string
  newPassword: string
  passwordEnabled: boolean
}): string | null {
  if (passwordEnabled && currentPassword.length === 0) {
    return "Enter your current password."
  }
  if (newPassword.length < 8) {
    return "Password must be at least 8 characters."
  }
  if (newPassword !== confirmPassword) {
    return "Passwords do not match."
  }
  return null
}

export function clerkErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "errors" in error) {
    const first = (error as ClerkApiError).errors?.[0]
    return first?.longMessage || first?.message || fallback
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

export function formatSessionActivity(session: {
  latestActivity?: {
    browserName?: string | null
    deviceType?: string | null
    city?: string | null
    country?: string | null
  } | null
}): string {
  const activity = session.latestActivity
  const client = [activity?.browserName, activity?.deviceType].filter(Boolean).join(" on ")
  const location = [activity?.city, activity?.country].filter(Boolean).join(", ")
  return [client, location].filter(Boolean).join(" · ") || "Unknown device"
}
