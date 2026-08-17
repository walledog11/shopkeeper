"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { OpenThreadCountProvider, useOpenThreadCountOverride } from "@/hooks/OpenThreadCountContext";
import { useInboxBadgeCountQuery } from "@/hooks/useThreads";
import type { AutonomyTier } from "@shopkeeper/agent/settings";
import { MobileChromeProvider } from "./mobile-chrome/MobileChromeContext";
import { MobileChromeSync } from "./mobile-chrome/MobileChromeSync";
import { MobileHubHeader } from "./mobile-chrome/MobileHubHeader";
import { DesktopTopBar } from "./sidebar/DesktopTopBar";
import { useNavAuth } from "./sidebar/useNavAuth";
import { MainContentScrim } from "./right-rail/MainContentScrim";

function useDashboardOpenCount(initialInboxCount: number) {
  const pathname = usePathname();
  const onTickets = pathname.startsWith("/dashboard/tickets");
  const { override } = useOpenThreadCountOverride();
  const { count: polledCount } = useInboxBadgeCountQuery(!onTickets, initialInboxCount);
  return onTickets ? (override ?? polledCount) : polledCount;
}

function DashboardSidebarContent({
  children,
  initialAutonomyTier,
  initialInboxCount,
  rightRail,
}: {
  children: React.ReactNode;
  initialAutonomyTier: AutonomyTier;
  initialInboxCount: number;
  rightRail: React.ReactNode;
}) {
  const openCount = useDashboardOpenCount(initialInboxCount);
  const navAuth = useNavAuth(initialAutonomyTier);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("dashboard-locked");
    document.body.classList.add("dashboard-locked");

    return () => {
      document.documentElement.classList.remove("dashboard-locked");
      document.body.classList.remove("dashboard-locked");
    };
  }, []);

  return (
    <MobileChromeProvider>
      <MobileChromeSync />
      {isSwitching && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="size-4 rounded-full border-2 border-foreground/20 border-t-foreground/70 animate-spin" />
            <span className="text-sm font-medium">Switching workspace…</span>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0 w-full overflow-x-hidden flex-col bg-background">
        <DesktopTopBar
          openCount={openCount}
          onSwitching={setIsSwitching}
          navAuth={navAuth}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-row">
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileHubHeader
              openCount={openCount}
              onSwitching={setIsSwitching}
              navAuth={navAuth}
            />

            <div className="dashboard-content relative z-0 flex-1 min-h-0 overflow-hidden flex flex-col">
              {children}
              <MainContentScrim />
            </div>
          </div>

          {rightRail}
        </div>
      </div>
    </MobileChromeProvider>
  );
}

export default function DashboardSidebar({
  children,
  initialAutonomyTier,
  initialInboxCount,
  rightRail,
}: {
  children: React.ReactNode;
  initialAutonomyTier: AutonomyTier;
  initialInboxCount: number;
  rightRail: React.ReactNode;
}) {
  return (
    <OpenThreadCountProvider>
      <DashboardSidebarContent
        initialAutonomyTier={initialAutonomyTier}
        initialInboxCount={initialInboxCount}
        rightRail={rightRail}
      >
        {children}
      </DashboardSidebarContent>
    </OpenThreadCountProvider>
  );
}
