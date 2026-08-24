"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrgAvatar } from "@/components/OrgAvatar";
import { cn } from "@/lib/ui/cn";
import {
  desktopTopBarUtilityPillClass,
  isRouteActive,
} from "./sidebar-helpers";
import type { NavAuth } from "./useNavAuth";
import { accountSettingsNavItem } from "../nav-items";
import {
  dashboardNavPrefetchHandlers,
  useDashboardNavPrefetch,
} from "./useDashboardNavPrefetch";

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
  const pathname = usePathname();
  const prefetchNav = useDashboardNavPrefetch();
  const isTopBar = variant === "topBar";
  const isEmbedded = variant === "embedded";
  const showAvatarOnly = isTopBar || isEmbedded;
  const href = accountSettingsNavItem.href;
  const isActive = isRouteActive(pathname, href);

  const link = (
    <Link
      href={href}
      aria-label={`${fullName} account settings`}
      aria-current={isActive ? "page" : undefined}
      title="Account settings"
      onClick={(event) => {
        if (isActive) event.preventDefault();
        onClose?.();
      }}
      {...dashboardNavPrefetchHandlers(prefetchNav, href)}
      className={cn(
        "flex min-w-0 items-center text-left outline-none transition-colors",
        showAvatarOnly
          ? cn(
              "h-12 w-full justify-center rounded-xl px-3 hover:bg-white/50",
              isActive && "bg-white/50",
            )
          : cn(
              "w-full gap-2.5 rounded-lg px-3 py-2.5 hover:bg-foreground/[0.05]",
              isActive && "bg-foreground/[0.05]",
            ),
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
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-sidebar-foreground">{fullName}</p>
          <p className="mt-0.5 truncate text-xs font-medium leading-tight text-muted-foreground">{roleLabel}</p>
        </div>
      )}
    </Link>
  );

  if (!isTopBar) return link;

  return (
    <div data-dashboard-account-header="" className={cn(desktopTopBarUtilityPillClass, "shrink-0")}>
      {link}
    </div>
  );
}
