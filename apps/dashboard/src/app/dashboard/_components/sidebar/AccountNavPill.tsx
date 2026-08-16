"use client";

import Link from "next/link";
import { User } from "lucide-react";
import { OrgAvatar } from "@/components/OrgAvatar";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/ui/cn";
import { NavPillShell } from "./nav-pill-shared";
import {
  desktopTopBarDropdownMenuItemClass,
  navPillDropdownPanelClass,
} from "./sidebar-helpers";
import type { NavAuth } from "./useNavAuth";

const ACCOUNT_SETTINGS_HREF = "/dashboard/settings#account";

export function AccountNavPill({
  navAuth,
  onClose,
  variant,
}: {
  navAuth: NavAuth;
  onClose?: () => void;
  variant: "topBar" | "sheet" | "embedded";
}) {
  const { user, fullName, roleLabel } = navAuth;
  const isTopBar = variant === "topBar";
  const isEmbedded = variant === "embedded";
  const showAvatarOnly = isTopBar || isEmbedded;

  const trigger = (
    <button
      type="button"
      aria-label={`${fullName} account menu`}
      title="Account settings"
      className={cn(
        "flex items-center outline-none text-left transition-colors min-w-0",
        showAvatarOnly
          ? "h-12 px-3 rounded-xl hover:bg-sidebar-accent/50"
          : "w-full gap-2.5 rounded-lg px-3 py-2.5 hover:bg-foreground/[0.05]",
      )}
    >
      <OrgAvatar
        name={fullName}
        imageUrl={user?.imageUrl}
        className={cn(
          "rounded-full bg-muted text-sidebar-foreground font-bold shrink-0 ring-1 ring-border/60",
          showAvatarOnly ? "size-7 text-xs" : "size-8 text-xs ring-border",
        )}
      />
      {!showAvatarOnly && (
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sidebar-foreground truncate leading-tight text-sm">{fullName}</p>
          <p className="text-xs font-medium text-muted-foreground truncate leading-tight mt-0.5">{roleLabel}</p>
        </div>
      )}
    </button>
  );

  const menu = (
    <DropdownMenuContent
      side="bottom"
      align="end"
      sideOffset={10}
      className={navPillDropdownPanelClass(isTopBar)}
    >
      <DropdownMenuLabel className="px-2.5 py-1.5 min-w-0">
        <p className="truncate text-sm font-semibold text-sidebar-foreground">{fullName}</p>
        <p className="truncate text-xs font-medium text-sidebar-foreground/60">{roleLabel}</p>
      </DropdownMenuLabel>
      <DropdownMenuItem asChild className={desktopTopBarDropdownMenuItemClass()}>
        <Link href={ACCOUNT_SETTINGS_HREF} onClick={() => onClose?.()}>
          <User className="size-4 shrink-0 text-sidebar-foreground/50" />
          <span className="font-medium">Account settings</span>
        </Link>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <NavPillShell variant={variant} headerId="account-header" trigger={trigger} menu={menu} />
  );
}
