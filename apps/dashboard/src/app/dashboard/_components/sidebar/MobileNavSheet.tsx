"use client";

import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { NavGroupList } from "./NavGroupList";
import { OrgSwitcher } from "./OrgSwitcher";
import { dispatchNavProgressStart } from "./sidebar-helpers";
import { UserMenu } from "./UserMenu";
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
        side="top"
        showCloseButton={false}
        className="bg-sidebar border-b border-border p-0 max-h-[90dvh] overflow-y-auto"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>

        <div className="sticky top-0 z-50 flex bg-sidebar items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <OrgSwitcher navAuth={navAuth} onSwitching={onSwitching} onClose={onClose} variant="sheet" />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="p-2 rounded-md text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors shrink-0"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="px-3 py-2">
          <NavGroupList pathname={pathname} openCount={openCount} onNavigate={handleNavClick} />
        </div>

        <div className="sticky bottom-0 bg-sidebar w-full border-t border-border px-3 py-2">
          <UserMenu navAuth={navAuth} variant="sheet" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
