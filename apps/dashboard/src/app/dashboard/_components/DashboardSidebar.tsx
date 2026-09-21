"use client";

import { useEffect, useState } from "react";
import type { AutonomyTier } from "@shopkeeper/agent/settings";
import { MobileChromeProvider } from "./mobile-chrome/MobileChromeContext";
import { MobileChromeSync } from "./mobile-chrome/MobileChromeSync";
import { MobileHubHeader } from "./mobile-chrome/MobileHubHeader";
import { MainContentScrim } from "./right-rail/MainContentScrim";
import { DesktopTopBar } from "./sidebar/DesktopTopBar";
import { AlertCircle } from "lucide-react";
import { ORG_SWITCH_FAILED_EVENT } from "@/lib/dashboard/org-switch-error";
import { useNavAuth } from "./sidebar/useNavAuth";

function DashboardSidebarContent({
  children,
  initialAutonomyTier,
  rightRail,
}: {
  children: React.ReactNode;
  initialAutonomyTier: AutonomyTier;
  rightRail: React.ReactNode;
}) {
  const navAuth = useNavAuth(initialAutonomyTier);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchErrorToast, setSwitchErrorToast] = useState<string | null>(null);

  useEffect(() => {
    const onSwitchFailed = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message
        ?? "Couldn’t switch workspace. Try again.";
      setSwitchErrorToast(message);
    };
    window.addEventListener(ORG_SWITCH_FAILED_EVENT, onSwitchFailed);
    return () => window.removeEventListener(ORG_SWITCH_FAILED_EVENT, onSwitchFailed);
  }, []);

  useEffect(() => {
    if (!switchErrorToast) return;
    const timer = window.setTimeout(() => setSwitchErrorToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [switchErrorToast]);

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
      {switchErrorToast && (
        <div className="fixed bottom-6 left-1/2 z-[90] flex max-w-sm -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-lg">
          <AlertCircle className="size-4 shrink-0 text-red-400" />
          {switchErrorToast}
        </div>
      )}

      {isSwitching && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="size-4 rounded-full border-2 border-foreground/20 border-t-foreground/70 animate-spin" />
            <span className="text-sm font-medium">Switching workspace…</span>
          </div>
        </div>
      )}

      <div className="relative flex flex-1 min-h-0 w-full flex-col overflow-x-hidden bg-background">
        <DesktopTopBar
          onSwitching={setIsSwitching}
          navAuth={navAuth}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-row">
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileHubHeader
              onSwitching={setIsSwitching}
              navAuth={navAuth}
            />

            <div className="dashboard-content relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden">
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
  rightRail,
}: {
  children: React.ReactNode;
  initialAutonomyTier: AutonomyTier;
  rightRail: React.ReactNode;
}) {
  return (
    <DashboardSidebarContent
      initialAutonomyTier={initialAutonomyTier}
      rightRail={rightRail}
    >
      {children}
    </DashboardSidebarContent>
  );
}
