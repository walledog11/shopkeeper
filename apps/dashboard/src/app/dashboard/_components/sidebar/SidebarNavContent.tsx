"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Search } from "lucide-react";
import { SidebarContent, SidebarFooter, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/ui/cn";
import AutonomyPill from "../AutonomyPill";
import { useCommandPalette } from "../CommandPaletteContext";
import { FooterLinks } from "./FooterLinks";
import { NavGroupList } from "./NavGroupList";
import { OrgSwitcher } from "./OrgSwitcher";
import { dispatchNavProgressStart } from "./sidebar-helpers";
import { UserMenu } from "./UserMenu";
import type { NavAuth } from "./useNavAuth";

export function SidebarNavContent({
  openCount,
  onSwitching,
  navAuth,
  agentName,
}: {
  openCount: number;
  onSwitching: (v: boolean) => void;
  navAuth: NavAuth;
  agentName: string;
}) {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  const { open: openCmd } = useCommandPalette();

  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const clearScrollTimer = useCallback(() => {
    if (scrollTimer.current) {
      clearTimeout(scrollTimer.current);
      scrollTimer.current = null;
    }
  }, []);
  const handleScroll = useCallback(() => {
    setIsScrolling(true);
    clearScrollTimer();
    scrollTimer.current = setTimeout(() => {
      scrollTimer.current = null;
      setIsScrolling(false);
    }, 800);
  }, [clearScrollTimer]);

  useEffect(() => clearScrollTimer, [clearScrollTimer]);

  const handleNavClick = (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => {
    if (isActive) {
      e.preventDefault();
      return;
    }
    if (isMobile) setOpenMobile(false);
    dispatchNavProgressStart();
  };

  return (
    <>
      <SidebarContent
        className={cn(
          "px-2 pt-1 pb-2 gap-0 overflow-x-hidden bg-neutral-950 custom-scrollbar",
          isScrolling && "is-scrolling",
        )}
        onScroll={handleScroll}
      >
        <div className="pb-1 mb-2 border-b border-white/[0.06]">
          <OrgSwitcher navAuth={navAuth} onSwitching={onSwitching} variant="desktop" />
        </div>

        <AutonomyPill tier={navAuth.autonomyTier} className="mb-2.5 w-full justify-center" />

        <button
          type="button"
          onClick={openCmd}
          className="w-full mb-2.5 flex items-center gap-2 px-2.5 py-2 rounded-md bg-white/[0.1] hover:bg-white/[0.2] transition-colors outline-none text-left"
        >
          <Search className="size-3.5 text-white/35 shrink-0" />
          <span className="flex-1 text-xs text-white/40">Search or jump to…</span>
          <kbd className="text-xs font-semibold bg-white/[0.08] px-1 py-0.5 rounded text-white/40 shrink-0 leading-none">⌘K</kbd>
        </button>

        <NavGroupList pathname={pathname} openCount={openCount} onNavigate={handleNavClick} variant="desktop" agentName={agentName} />
      </SidebarContent>

      <SidebarFooter className="border-t bg-neutral-950 border-sidebar-border p-2 gap-0">
        <div className="flex items-center gap-1">
          <UserMenu navAuth={navAuth} variant="desktop" />
          <FooterLinks pathname={pathname} onNavigate={handleNavClick} variant="desktop" />
        </div>
      </SidebarFooter>
    </>
  );
}
