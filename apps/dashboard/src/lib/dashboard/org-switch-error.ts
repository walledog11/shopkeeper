export const ORG_SWITCH_FAILED_EVENT = "shopkeeper:org-switch-failed"

export function notifyOrgSwitchFailed(message = "Couldn’t switch workspace. Try again.") {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(ORG_SWITCH_FAILED_EVENT, { detail: { message } }))
}
