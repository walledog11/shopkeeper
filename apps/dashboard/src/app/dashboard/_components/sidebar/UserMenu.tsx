"use client";

import Link from "next/link";
import { LogOut, Settings2 } from "lucide-react";
import { OrgAvatar } from "@/components/OrgAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/ui/cn";
import type { NavAuth } from "./useNavAuth";

export function UserMenu({ navAuth, variant }: { navAuth: NavAuth; variant: "topBar" | "sheet" }) {
  const { user, signOut, fullName, roleLabel } = navAuth;
  const isTopBar = variant === "topBar";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={fullName}
          className={cn(
            "flex items-center rounded-lg transition-colors text-left outline-none min-w-0 hover:bg-sidebar-accent/80",
            isTopBar ? "p-1 shrink-0" : "gap-2.5 flex-1 px-3 py-2.5",
          )}
        >
          <OrgAvatar
            name={fullName}
            imageUrl={user?.imageUrl}
            className={cn(
              "rounded-full bg-muted text-sidebar-foreground font-bold ring-1 ring-border shrink-0",
              isTopBar ? "size-7 text-xs" : "size-8 text-xs",
            )}
          />
          {!isTopBar && (
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sidebar-foreground truncate leading-tight text-sm">{fullName}</p>
              <p className="text-xs font-medium text-muted-foreground truncate leading-tight mt-0.5">{roleLabel}</p>
            </div>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isTopBar ? "bottom" : "top"}
        align={isTopBar ? "end" : "start"}
        sideOffset={8}
        className="w-52 bg-popover border-border text-popover-foreground"
      >
        <DropdownMenuItem asChild className="cursor-pointer gap-2 focus:bg-accent">
          <Link href="/dashboard/account">
            <Settings2 className="size-4 shrink-0" />
            Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => signOut({ redirectUrl: "/login" })}
          className="text-destructive focus:text-destructive focus:bg-accent cursor-pointer gap-2"
        >
          <LogOut className="size-4 shrink-0" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
