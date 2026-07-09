"use client";

import Link from "next/link";
import { OrgAvatar } from "@/components/OrgAvatar";
import { cn } from "@/lib/ui/cn";
import type { NavAuth } from "./useNavAuth";

export function UserAvatarLink({ navAuth, variant }: { navAuth: NavAuth; variant: "topBar" | "sheet" }) {
  const { user, fullName, roleLabel } = navAuth;
  const isTopBar = variant === "topBar";

  return (
    <Link
      href="/dashboard/settings#account"
      aria-label={`${fullName} account settings`}
      title="Account settings"
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
    </Link>
  );
}
