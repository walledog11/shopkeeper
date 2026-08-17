"use client";

import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { CircleHelp, X } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { usePanelBriefingData } from "../agent-panel/usePanelBriefingData";
import { useHelp } from "../help/HelpContext";
import { mobileNavSections } from "../nav-items";
import { NavGroupList } from "./NavGroupList";
import { OrganizationNavPill } from "./OrganizationNavPill";
import { AccountNavPill } from "./AccountNavPill";
import { LogOutButton } from "./LogOutButton";
import {
  desktopTopBarUtilityPillClass,
  mobileNavGroupCardClass,
  mobileNavLinkClass,
  topBarIconButtonClass,
} from "./sidebar-helpers";
import type { NavAuth } from "./useNavAuth";

export function MobileNavSheet({
  open,
  onClose,
  openCount,
  onSwitching,
  navAuth,
}: {
  open: boolean;
  onClose: () => void;
  openCount: number;
  onSwitching: (v: boolean) => void;
  navAuth: NavAuth;
}) {
  const pathname = usePathname();
  const { summary } = usePanelBriefingData(open);
  const needsYouCount = summary.metrics.needsYouCount;
  const { openHelp } = useHelp();

  // The sheet and the panel both own the screen on mobile, so hand off rather
  // than stack them.
  const handleOpenHelp = () => {
    onClose();
    openHelp();
  };

  const handleNavClick = (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => {
    if (isActive) {
      e.preventDefault();
      return;
    }
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        overlayClassName="bg-foreground/[0.06]"
        className={cn(
          "flex w-full flex-col gap-0 border-border/80 p-0 shadow-[0_8px_24px_-6px_rgba(43,33,24,0.14),0_2px_8px_-2px_rgba(43,33,24,0.08)] sm:max-w-sm",
          "bg-sidebar/95 backdrop-blur-md supports-[backdrop-filter]:bg-sidebar/85",
        )}
      >
        <SheetTitle className="sr-only">More</SheetTitle>

        <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-3">
          <div className={cn(desktopTopBarUtilityPillClass, "min-w-0 flex-1")}>
            <OrganizationNavPill
              navAuth={navAuth}
              onSwitching={onSwitching}
              onClose={onClose}
              variant="embedded"
            />
          </div>

          <div className={desktopTopBarUtilityPillClass}>
            <AccountNavPill navAuth={navAuth} onClose={onClose} variant="embedded" />
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className={topBarIconButtonClass}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          <NavGroupList
            sections={mobileNavSections}
            pathname={pathname}
            needsYouCount={needsYouCount}
            openCount={openCount}
            onNavigate={handleNavClick}
          />
        </div>

        <div className="shrink-0 px-4 pb-4 pt-2">
          <div className={mobileNavGroupCardClass}>
            <button
              type="button"
              onClick={handleOpenHelp}
              className={mobileNavLinkClass(false)}
            >
              <CircleHelp className="size-[18px] shrink-0 stroke-[1.5] text-sidebar-foreground/70" />
              <span className="flex-1 text-sm font-medium leading-tight">Help</span>
            </button>
            <LogOutButton navAuth={navAuth} variant="sheet" onClick={onClose} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
