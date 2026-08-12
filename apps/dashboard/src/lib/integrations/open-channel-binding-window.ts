import type { ChannelBindingAttempt } from "./channel-binding-client";

/**
 * Opens a placeholder during the user's click, before the binding request
 * yields. This preserves browser user activation while keeping the returned
 * URL available in the calling UI when popups are blocked.
 */
export async function openChannelBindingWindow(
  startBinding: () => Promise<ChannelBindingAttempt | null>,
): Promise<void> {
  const pendingWindow = window.open("about:blank", "_blank");
  if (pendingWindow) {
    try {
      pendingWindow.opener = null;
    } catch {
      // Some browsers expose opener as read-only; navigation can still proceed.
    }
  }

  const attempt = await startBinding();
  if (!attempt) {
    pendingWindow?.close();
    return;
  }

  if (!pendingWindow) return;
  try {
    pendingWindow.location.replace(attempt.value);
  } catch {
    pendingWindow.close();
    // The calling UI still renders the returned URL as a manual fallback.
  }
}
