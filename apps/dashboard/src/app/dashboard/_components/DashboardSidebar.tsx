"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { OpenThreadCountProvider, useOpenThreadCountOverride } from "@/hooks/OpenThreadCountContext";
import { useOpenThreadCountQuery } from "@/hooks/useThreads";
import type { AutonomyTier } from "@shopkeeper/agent/settings";
import { MobileChromeProvider } from "./mobile-chrome/MobileChromeContext";
import { MobileChromeSync } from "./mobile-chrome/MobileChromeSync";
import { MobileHubHeader } from "./mobile-chrome/MobileHubHeader";
import { DesktopTopBar } from "./sidebar/DesktopTopBar";
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
  const [isSwitching, setIsSwitching] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);

  useEffect(() => {
    document.documentElement.classList.add("dashboard-locked");
    document.body.classList.add("dashboard-locked");

    return () => {
      document.documentElement.classList.remove("dashboard-locked");
      document.body.classList.remove("dashboard-locked");
    };
  }, []);

  return (
    <MobileChromeProvider onOpenNav={openMobileNav}>
      <MobileChromeSync />
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

        <MobileHubHeader
          agentName={agentName}
          onOpenNav={openMobileNav}
        />

        <div className="dashboard-content flex-1 min-h-0 overflow-hidden flex flex-col">
          {children}
        </div>
      </div>

      <MobileNavSheet
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        agentName={agentName}
        openCount={openCount}
        onSwitching={setIsSwitching}
        navAuth={navAuth}
      />
    </MobileChromeProvider>
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
