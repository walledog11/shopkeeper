import { HelpProvider } from "./_components/help/HelpContext";
import NotificationBar, { type Notification } from "./_components/NotificationBar";
import NavProgressBar from "./_components/NavProgressBar";
import DashboardSidebar from "./_components/DashboardSidebar";
import DashboardHeader from "./_components/DashboardHeader";
import HelpPanel from "./_components/help/HelpPanel";
import AgentPanelRoot from "./_components/agent-panel/AgentPanelRoot";
import { AgentPanelProvider } from "./_components/agent-panel/AgentPanelContext";
import { CommandPaletteProvider } from "./_components/CommandPaletteContext";
import { getOrCreateOrg } from "@/lib/server/org";
import { resolveAgentSettings } from "@/lib/agent/settings";
import { db } from "@clerk/db";
import type { OrgSettings } from "@/types";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const org = await getOrCreateOrg();
  const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);

  const notifications: Notification[] = [];

  // No channel connected yet
  const integrationCount = await db.integration.count({ where: { organizationId: org.id } });
  if (integrationCount === 0) {
    notifications.push({
      id: "no-integration",
      type: "info",
      title: "Connect your first channel",
      message: "Start receiving support tickets from email, Instagram, SMS, and more.",
      action: { label: "Add integration", href: "/dashboard/integrations" },
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
      <CommandPaletteProvider>
      <div className="dashboard-shell dark flex h-dvh w-full flex-col overflow-hidden bg-background font-sans">
        <NotificationBar notifications={notifications} />
        <NavProgressBar />
        <DashboardSidebar>
          
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
