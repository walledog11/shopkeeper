import { Suspense } from "react";
import { HelpProvider } from "../_components/help/HelpContext";
import NotificationBar, { type Notification } from "../_components/NotificationBar";
import NavProgressBar from "../_components/NavProgressBar";
import DashboardSidebar from "../_components/DashboardSidebar";
import HelpPanel from "../_components/help/HelpPanel";
import AgentPanelRoot from "../_components/agent-panel/AgentPanelRoot";
import AgentPanelUrlSync from "../_components/agent-panel/AgentPanelUrlSync";
import { AgentPanelProvider } from "../_components/agent-panel/AgentPanelContext";
import { CommandPaletteProvider } from "../_components/CommandPaletteContext";
import { getOrCreateOrg } from "@/lib/server/org";
import { resolveAgentSettings } from "@shopkeeper/agent/settings";
import { getChannelInfo } from "@/lib/messaging/channels";
import { db } from "@shopkeeper/db";
import type { OrgSettings } from "@/types";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const org = await getOrCreateOrg();
  const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);

  const notifications: Notification[] = [];

  // Onboarding progress (incl. "connect your first channel") lives in the home
  // WorkflowSetupBanner — the single source of truth. The top bar carries only
  // time-sensitive alerts below.

  // Integration token expired or expiring within 7 days
  const expiringIntegrations = await db.integration.findMany({
    where: {
      organizationId: org.id,
      tokenExpiresAt: { not: null, lt: new Date(Date.now() + SEVEN_DAYS_MS) },
    },
    select: { platform: true, tokenExpiresAt: true },
  });
  if (expiringIntegrations.length > 0) {
    const now = Date.now();
    const expired = expiringIntegrations.some((i) => i.tokenExpiresAt!.getTime() <= now);
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
        action: { label: "Upgrade now", href: "/dashboard/settings?tab=billing" },
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
      action: { label: "Update billing", href: "/dashboard/settings?tab=billing" },
    });
  }

  return (
    <HelpProvider>
      <AgentPanelProvider>
      <CommandPaletteProvider agentName={settings.agentName}>
      <Suspense fallback={null}>
        <AgentPanelUrlSync />
      </Suspense>
      <div
        className="dashboard-shell flex h-dvh w-full flex-col overflow-hidden bg-background font-sans"
        style={{ "--m-serif": "Georgia, 'Times New Roman', serif" } as React.CSSProperties}
      >
        <NotificationBar notifications={notifications} />
        <NavProgressBar />
        <DashboardSidebar initialAutonomyTier={settings.autonomyTier ?? "guarded"} agentName={settings.agentName}>
          <div className="flex-1 overflow-hidden flex min-h-0">
            <div className="flex-1 overflow-hidden flex flex-col min-w-0">
              {children}
            </div>
            <HelpPanel />
            <AgentPanelRoot agentName={settings.agentName} />
          </div>
        </DashboardSidebar>
      </div>
      </CommandPaletteProvider>
      </AgentPanelProvider>
    </HelpProvider>
  );
}
