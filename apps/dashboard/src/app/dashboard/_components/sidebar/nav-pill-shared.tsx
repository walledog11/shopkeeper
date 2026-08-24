"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { desktopTopBarUtilityPillClass } from "./sidebar-helpers";

type NavPillVariant = "topBar" | "sheet" | "embedded";

export function NavPillShell({
  variant,
  trigger,
  menu,
}: {
  variant: NavPillVariant;
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
    <div data-dashboard-organization-header="" className={cn(desktopTopBarUtilityPillClass, "shrink-0")}>
      {dropdown}
    </div>
  );
}
