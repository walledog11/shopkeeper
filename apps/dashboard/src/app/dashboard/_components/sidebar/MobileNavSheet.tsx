"use client";

import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { usePanelBriefingData } from "../agent-panel/usePanelBriefingData";
import { mobileNavSections } from "../nav-items";
import { NavGroupList } from "./NavGroupList";
import { OrgSwitcher } from "./OrgSwitcher";
import { dispatchNavProgressStart } from "./sidebar-helpers";
import { UserMenu } from "./UserMenu";
import type { NavAuth } from "./useNavAuth";

export function MobileNavSheet({
  open,
  onClose,
  agentName,
  openCount,
  onSwitching,
  navAuth,
}: {
  open: boolean;
  onClose: () => void;
  agentName: string;
  openCount: number;
  onSwitching: (v: boolean) => void;
  navAuth: NavAuth;
}) {
  const pathname = usePathname();
  const { summary } = usePanelBriefingData(open);
  const needsYouCount = summary.metrics.needsYouCount;

  const handleNavClick = (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => {
    if (isActive) {
      e.preventDefault();
      return;
    }
    onClose();
    dispatchNavProgressStart();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 border-border bg-background p-0 sm:max-w-sm"
      >
        <SheetTitle className="sr-only">More</SheetTitle>

        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <OrgSwitcher navAuth={navAuth} onSwitching={onSwitching} onClose={onClose} variant="sheet" />
          </div>
          <UserMenu navAuth={navAuth} variant="topBar" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <NavGroupList
            sections={mobileNavSections}
            agentName={agentName}
            pathname={pathname}
            needsYouCount={needsYouCount}
            openCount={openCount}
            onNavigate={handleNavClick}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
