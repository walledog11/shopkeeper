import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HelpProvider } from "../_components/help/HelpContext";
import NotificationBar, { type Notification } from "../_components/NotificationBar";
import NavProgressBar from "../_components/NavProgressBar";
import DashboardSidebar from "../_components/DashboardSidebar";
import AgentPanelUrlSync from "../_components/agent-panel/AgentPanelUrlSync";
import { AgentPanelProvider } from "../_components/agent-panel/AgentPanelContext";
import { RightRailProvider } from "../_components/right-rail/RightRailContext";
import DashboardRightRail from "../_components/right-rail/DashboardRightRail";
import RealtimeProvider from "@/components/realtime/RealtimeProvider";
import { getOrCreateOrg } from "@/lib/server/org";
import { getIncompleteOnboardingRedirect } from "@/lib/server/onboarding-guard";
import { resolveAgentSettings } from "@shopkeeper/agent/settings";
import { getChannelInfo } from "@/lib/messaging/channels";
import { countThreadsBySqlFilters } from "@/lib/messaging/thread-list-query";
import { isEmailAuthReauthorizationRequired } from "@shopkeeper/email/providers";
import { db } from "@shopkeeper/db";
import type { OrgSettings } from "@/types";
import {
  parseDismissedNotificationIds,
  NOTIFICATION_DISMISSALS_COOKIE,
} from "@/lib/dashboard-dismissals";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const org = await getOrCreateOrg();
  const incompleteOnboardingPath = await getIncompleteOnboardingRedirect(org.id, org.settings);
  if (incompleteOnboardingPath) redirect(incompleteOnboardingPath);

  const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);

  const notifications: Notification[] = [];

  // Onboarding progress (incl. "connect your first channel") lives in the home
  // WorkflowSetupBanner — the single source of truth. The top bar carries only
  // time-sensitive alerts below.

  // Integration token expired or expiring within 7 days.
  // Gmail access tokens refresh automatically — only flag email when OAuth reauth is required.
  const [integrations, inboxBadgeCount] = await Promise.all([
    db.integration.findMany({
      where: { organizationId: org.id },
      select: { platform: true, tokenExpiresAt: true, metadata: true },
    }),
    // The inbox badge polls this same count client-side; seeding it keeps it from
    // rendering 0 and popping on every route. These filters mirror the query string
    // in `useInboxBadgeCountQuery` exactly — diverge and the badge moves on first poll.
    countThreadsBySqlFilters(org.id, {
      forMe: true,
      hasDraft: false,
      needsReply: false,
      wantsFiltered: false,
      status: "open",
    }),
  ]);
  const expiringIntegrations = integrations.filter((integration) => {
    if (integration.platform === "email") {
      return isEmailAuthReauthorizationRequired(integration);
    }
    if (!integration.tokenExpiresAt) return false;
    return integration.tokenExpiresAt.getTime() <= Date.now() + SEVEN_DAYS_MS;
  });
  if (expiringIntegrations.length > 0) {
    const now = Date.now();
    const expired = expiringIntegrations.some((integration) => {
      if (integration.platform === "email") return true;
      return integration.tokenExpiresAt!.getTime() <= now;
    });
    const names = [...new Set(expiringIntegrations.map((i) => getChannelInfo(i.platform).name))].join(", ");
    notifications.push({
      id: "integration-expiry",
      type: "warning",
      title: expired ? `${names} disconnected` : `${names} connection expiring soon`,
      message: expired
        ? "Reconnect to keep receiving messages from this channel."
        : "Reconnect soon to avoid missing messages.",
      action: { label: "Reconnect", href: "/dashboard/integrations" },
    });
  }

  // Trial ending within 7 days
  if (org.stripeStatus === "trialing" && org.trialEndsAt) {
    const daysLeft = Math.ceil((org.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft > 0 && daysLeft <= 7) {
      notifications.push({
        id: "trial-ending",
        type: "warning",
        title: `Your free trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.`,
        message: "Upgrade to keep your team running smoothly.",
        action: { label: "Upgrade now", href: "/dashboard/settings#billing" },
      });
    }
  }

  // Payment past due
  if (org.stripeStatus === "past_due") {
    notifications.push({
      id: "past-due",
      type: "warning",
      title: "Your payment failed.",
      message: "Update your billing details to avoid service interruption.",
      action: { label: "Update billing", href: "/dashboard/settings#billing" },
    });
  }

  // Subscription canceled — writes are blocked by the billing gate
  if (org.stripeStatus === "canceled") {
    notifications.push({
      id: "canceled",
      type: "warning",
      title: "Your subscription is canceled.",
      message: "Reactivate your plan to restore agent actions and sending.",
      action: { label: "Reactivate", href: "/dashboard/settings#billing" },
    });
  }

  const cookieStore = await cookies();
  const dismissedNotificationIds = parseDismissedNotificationIds(
    cookieStore.get(NOTIFICATION_DISMISSALS_COOKIE)?.value,
  );
  const visibleNotifications = notifications.filter(notification => !dismissedNotificationIds.has(notification.id));

  return (
    <RightRailProvider>
    <HelpProvider>
      <AgentPanelProvider>
      <Suspense fallback={null}>
        <AgentPanelUrlSync />
      </Suspense>
      <div
        className="dashboard-shell flex h-dvh w-full flex-col overflow-hidden bg-background font-sans"
        style={{ "--m-serif": "Georgia, 'Times New Roman', serif" } as React.CSSProperties}
      >
        <RealtimeProvider />
        <NotificationBar
          notifications={visibleNotifications}
          initialDismissedIds={[...dismissedNotificationIds]}
        />
        <NavProgressBar />
        <DashboardSidebar
          initialAutonomyTier={settings.autonomyTier ?? "guarded"}
          initialInboxCount={inboxBadgeCount}
          rightRail={<DashboardRightRail />}
        >
          {children}
        </DashboardSidebar>
      </div>
      </AgentPanelProvider>
    </HelpProvider>
    </RightRailProvider>
  );
}
