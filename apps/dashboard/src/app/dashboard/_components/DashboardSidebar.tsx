"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { OpenThreadCountProvider, useOpenThreadCountOverride } from "@/hooks/OpenThreadCountContext";
import { useOpenThreadCountQuery } from "@/hooks/useThreads";
import type { AutonomyTier } from "@shopkeeper/agent/settings";
import { cn } from "@/lib/ui/cn";
import AgentAvatar from "./agent-panel/AgentAvatar";
import { useAgentPanel } from "./agent-panel/AgentPanelContext";
import AutonomyPill from "./AutonomyPill";
import { DesktopTopBar } from "./sidebar/DesktopTopBar";
import { Logo } from "./sidebar/Logo";
import { MobileBottomBar } from "./sidebar/MobileBottomBar";
import { MobileNavSheet } from "./sidebar/MobileNavSheet";
import { useNavAuth } from "./sidebar/useNavAuth";

function useDashboardOpenCount() {
  const pathname = usePathname();
  const onTickets = pathname.startsWith("/dashboard/tickets");
  const { override } = useOpenThreadCountOverride();
  const { count: polledCount } = useOpenThreadCountQuery(!onTickets);
  return onTickets ? (override ?? polledCount) : polledCount;
}

function DashboardSidebarContent({
  children,
  initialAutonomyTier,
  agentName,
}: {
  children: React.ReactNode;
  initialAutonomyTier: AutonomyTier;
  agentName: string;
}) {
  const openCount = useDashboardOpenCount();
  const navAuth = useNavAuth(initialAutonomyTier);
  const { open: openAgentPanel } = useAgentPanel();
  const [isSwitching, setIsSwitching] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("dashboard-locked");
    document.body.classList.add("dashboard-locked");

    return () => {
      document.documentElement.classList.remove("dashboard-locked");
      document.body.classList.remove("dashboard-locked");
    };
  }, []);

  return (
    <>
      {isSwitching && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center">
          <div className="flex items-center gap-3 text-foreground/60">
            <div className="size-4 rounded-full border-2 border-foreground/20 border-t-foreground/70 animate-spin" />
            <span className="text-sm font-medium">Switching workspace…</span>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 w-full overflow-x-hidden flex flex-col bg-background">
        <DesktopTopBar
          agentName={agentName}
          openCount={openCount}
          onSwitching={setIsSwitching}
          navAuth={navAuth}
        />

        <div
          data-dashboard-mobile-header
          className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border shrink-0 bg-sidebar"
        >
          <Logo iconOnly />
          <div className="flex items-center gap-1">
            <AutonomyPill tier={navAuth.autonomyTier} compact />
            <button
              type="button"
              onClick={() => openAgentPanel({ source: "command" })}
              aria-label="Open agent"
              title="Open agent"
              className="p-0.5 rounded-full border border-border bg-white hover:bg-white/90 transition-colors"
            >
              <AgentAvatar agentName={agentName} size="sm" imageSrc="/logos/coco-header-icon.png" />
            </button>
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="p-2 rounded-md text-foreground/60 hover:text-white hover:bg-foreground/[0.08] transition-colors"
            >
              <Menu className="size-5" />
            </button>
          </div>
        </div>

        <div
          className={cn(
            "dashboard-content flex-1 min-h-0 overflow-hidden flex flex-col md:pb-0",
            "pb-16",
          )}
        >
          {children}
        </div>
      </div>

      <MobileNavSheet
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        agentName={agentName}
        onSwitching={setIsSwitching}
        navAuth={navAuth}
      />

      <MobileBottomBar openCount={openCount} />
    </>
  );
}

export default function DashboardSidebar({
  children,
  initialAutonomyTier,
  agentName,
}: {
  children: React.ReactNode;
  initialAutonomyTier: AutonomyTier;
  agentName: string;
}) {
  return (
    <OpenThreadCountProvider>
      <DashboardSidebarContent initialAutonomyTier={initialAutonomyTier} agentName={agentName}>
        {children}
      </DashboardSidebarContent>
    </OpenThreadCountProvider>
  );
}
