"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { desktopTopBarUtilityPillClass } from "./sidebar-helpers";

type NavPillHeaderId = "workspace-header" | "account-header";

const HEADER_ATTR: Record<NavPillHeaderId, string> = {
  "workspace-header": "data-dashboard-workspace-header",
  "account-header": "data-dashboard-account-header",
};

type NavPillVariant = "topBar" | "sheet" | "embedded";

export function NavPillShell({
  variant,
  headerId,
  trigger,
  menu,
}: {
  variant: NavPillVariant;
  headerId: NavPillHeaderId;
  trigger: ReactNode;
  menu: ReactNode;
}) {
  const dropdown = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      {menu}
    </DropdownMenu>
  );

  if (variant !== "topBar") return dropdown;

  return (
    <header {...{ [HEADER_ATTR[headerId]]: "" }} className={cn(desktopTopBarUtilityPillClass, "shrink-0")}>
      {dropdown}
    </header>
  );
}
