"use client";

import Link from "next/link";
import { ChevronDown, Plus, Settings2 } from "lucide-react";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/ui/cn";
import { organizationSettingsNavItem } from "../nav-items";
import { NavPillShell } from "./nav-pill-shared";
import {
  desktopTopBarDropdownMenuItemClass,
  navPillDropdownPanelClass,
} from "./sidebar-helpers";
import type { NavAuth } from "./useNavAuth";

type OrganizationMembership = {
  organization: {
    id: string;
    name: string;
  };
};

export function OrganizationNavPill({
  navAuth,
  onSwitching,
  onClose,
  variant,
}: {
  navAuth: NavAuth;
  onSwitching: (v: boolean) => void;
  onClose?: () => void;
  variant: "topBar" | "sheet" | "embedded";
}) {
  const { organization, userMemberships, setActive, mounted } = navAuth;
  const isTopBar = variant === "topBar";
  const isEmbedded = variant === "embedded";
  const memberships = userMemberships.data as OrganizationMembership[] | undefined;
  const organizationName = organization?.name ?? "Organization";

  const switchOrganization = async (organizationId: string) => {
    if (organizationId === organization?.id || !setActive) return;

    onClose?.();
    onSwitching(true);

    try {
      await setActive({ organization: organizationId });
      window.location.reload();
    } catch (error) {
      console.error("Failed to switch organization", error);
      onSwitching(false);
    }
  };

  const trigger = (
    <button
      type="button"
      aria-label={`${organizationName} organization menu`}
      title={organizationName}
      className={cn(
        "flex items-center outline-none text-left transition-colors min-w-0",
        isTopBar
          ? "gap-1.5 h-12 max-w-[14rem] px-4 rounded-xl hover:bg-sidebar-accent/50"
          : isEmbedded
            ? "h-12 w-full gap-1.5 px-4 rounded-xl hover:bg-sidebar-accent/50"
            : "w-full gap-2 rounded-lg px-3 py-2.5 hover:bg-foreground/[0.05]",
      )}
    >
      <span className="truncate text-sm font-semibold text-sidebar-foreground">{organizationName}</span>
      <ChevronDown className="size-4 shrink-0 text-sidebar-foreground/40" />
    </button>
  );

  const menu = (
    <DropdownMenuContent
      side="bottom"
      align={isTopBar ? "end" : "start"}
      sideOffset={10}
      className={navPillDropdownPanelClass(isTopBar)}
    >
      <DropdownMenuLabel className="px-2.5 py-1.5 text-xs font-medium text-sidebar-foreground/60">
        Switch organization
      </DropdownMenuLabel>
      {mounted &&
        memberships?.map((mem) => {
          const isActive = mem.organization.id === organization?.id;

          return (
            <DropdownMenuItem
              key={mem.organization.id}
              onClick={() => switchOrganization(mem.organization.id)}
              className={desktopTopBarDropdownMenuItemClass(isActive)}
            >
              <span className="flex-1 truncate">{mem.organization.name}</span>
              {isActive && <span className="size-1.5 rounded-full bg-green-600 shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      <DropdownMenuItem asChild className={desktopTopBarDropdownMenuItemClass()}>
        <Link href="/create-workspace" onClick={() => onClose?.()}>
          <Plus className="size-4 shrink-0 text-sidebar-foreground/50" />
          <span className="font-medium">Add organization</span>
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator className="bg-border/80 my-1" />
      <DropdownMenuItem asChild className={desktopTopBarDropdownMenuItemClass()}>
        <Link href={organizationSettingsNavItem.href} onClick={() => onClose?.()}>
          <Settings2 className="size-4 shrink-0 text-sidebar-foreground/50" />
          <span className="font-medium">Organization settings</span>
        </Link>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <NavPillShell variant={variant} headerId="organization-header" trigger={trigger} menu={menu} />
  );
}
