"use client";

import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { FooterLinks } from "./FooterLinks";
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
  agentName,
}: {
  open: boolean;
  onClose: () => void;
  openCount: number;
  onSwitching: (v: boolean) => void;
  navAuth: NavAuth;
  agentName: string;
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
        className="bg-neutral-950 border-b border-white/[0.08] p-0 max-h-[90dvh] overflow-y-auto"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>

        <div className="sticky top-0 z-50 flex bg-neutral-950 items-center gap-2 px-3 py-2 border-b border-white/[0.08] shrink-0">
          <div className="flex-1 min-w-0">
            <OrgSwitcher navAuth={navAuth} onSwitching={onSwitching} onClose={onClose} variant="mobileCompact" />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="p-2 rounded-md text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="px-3 py-2">
          <NavGroupList pathname={pathname} openCount={openCount} onNavigate={handleNavClick} variant="mobile" agentName={agentName} />
        </div>

        <div className="sticky bottom-0 bg-neutral-950 w-full border-t border-white/[0.08] px-3 py-2">
          <div className="flex items-center gap-1 ">
            <UserMenu navAuth={navAuth} variant="mobile" />
            <FooterLinks pathname={pathname} onNavigate={handleNavClick} variant="mobile" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
