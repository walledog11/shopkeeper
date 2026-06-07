"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar, SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useOpenThreadCountQuery } from "@/hooks/useThreads";
import type { AutonomyTier } from "@shopkeeper/agent/settings";
import { cn } from "@/lib/ui/cn";
import AutonomyPill from "./AutonomyPill";
import { Logo } from "./sidebar/Logo";
import { MobileBottomBar } from "./sidebar/MobileBottomBar";
import { MobileNavSheet } from "./sidebar/MobileNavSheet";
import { SidebarNavContent } from "./sidebar/SidebarNavContent";
import { useNavAuth } from "./sidebar/useNavAuth";

export default function DashboardSidebar({
  children,
  initialAutonomyTier,
}: {
  children: React.ReactNode;
  initialAutonomyTier: AutonomyTier;
}) {
  const { count: openCount } = useOpenThreadCountQuery();
  const navAuth = useNavAuth(initialAutonomyTier);
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
          <div className="flex items-center gap-3 text-white/60">
            <div className="size-4 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
            <span className="text-sm font-medium">Switching workspace…</span>
          </div>
        </div>
      )}

      <SidebarProvider className="flex-1 min-h-0 w-full overflow-x-hidden">
        <Sidebar className="max-md:hidden border-r-0 bg-background" collapsible="offcanvas">
          <SidebarNavContent openCount={openCount} onSwitching={setIsSwitching} navAuth={navAuth} />
        </Sidebar>

        <SidebarInset className="flex-1 min-h-0 overflow-hidden bg-neutral-950 flex flex-col">
          <div
            data-dashboard-mobile-header
            className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border shrink-0 bg-sidebar"
          >
            <Logo />
            <div className="flex items-center gap-1">
              <AutonomyPill tier={navAuth.autonomyTier} compact />
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation"
                className="p-2 rounded-md text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
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
        </SidebarInset>
      </SidebarProvider>

      <MobileNavSheet
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        openCount={openCount}
        onSwitching={setIsSwitching}
        navAuth={navAuth}
      />

      <MobileBottomBar openCount={openCount} />
    </>
  );
}
