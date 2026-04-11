import { HelpProvider } from "./_components/help/HelpContext";
import NotificationBar, { type Notification } from "./_components/NotificationBar";
import NavProgressBar from "./_components/NavProgressBar";
import DashboardSidebar from "./_components/DashboardSidebar";
import DashboardHeader from "./_components/DashboardHeader";
import HelpPanel from "./_components/help/HelpPanel";
import AgentPanelRoot from "./_components/agent-panel/AgentPanelRoot";
import { AgentPanelProvider } from "./_components/agent-panel/AgentPanelContext";
import { getOrCreateOrg } from "@/lib/org";
import { resolveAgentSettings } from "@/lib/agent/settings";
import type { OrgSettings } from "@/types";

const NOTIFICATIONS: Notification[] = [
  {
    id: "add-integration",
    type: "info",
    title: "Connect your first channel",
    message: "Start receiving support tickets from email, Instagram, SMS, and more.",
    action: { label: "Add an integration", href: "/dashboard/integrations" },
  },
  {
    id: "billing",
    type: "warning",
    title: "Your free trial ends in 7 days.",
    message: "Upgrade to keep your team running smoothly.",
    action: { label: "Upgrade now", href: "/dashboard/settings?tab=billing" },
  },
  {
    id: "sms",
    type: "success",
    title: "SMS support is now available!",
    message: "Reach customers directly on their phones.",
    action: { label: "Enable it", href: "/dashboard/settings" },
  },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const org = await getOrCreateOrg();
  const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);

  return (
    <HelpProvider>
      <AgentPanelProvider>
      <div className="flex flex-col h-screen bg-background font-sans overflow-hidden">
        <NotificationBar notifications={NOTIFICATIONS} />
        <NavProgressBar />
        <DashboardSidebar>
          <DashboardHeader />
          <div className="flex-1 overflow-hidden flex min-h-0">
            <div className="flex-1 overflow-hidden flex flex-col min-w-0">
              {children}
            </div>
            <HelpPanel />
          </div>
        </DashboardSidebar>
      </div>
      <AgentPanelRoot agentName={settings.agentName} />
      </AgentPanelProvider>
    </HelpProvider>
  );
}
