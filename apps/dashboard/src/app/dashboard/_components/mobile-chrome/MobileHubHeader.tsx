"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { HeaderSearch } from "../header-search/HeaderSearch";
import { Logo } from "../sidebar/Logo";
import {
  dashboardChromeMaxWidthClass,
  desktopTopBarPillClass,
  desktopTopBarUtilityPillClass,
  topBarIconButtonClass,
} from "../sidebar/sidebar-helpers";

const ROUTE_TITLES: { prefix: string; title: string }[] = [
  { prefix: "/dashboard/tickets", title: "Inbox" },
  { prefix: "/dashboard/orders", title: "Shop" },
  { prefix: "/dashboard/review", title: "Review" },
  { prefix: "/dashboard/agent/configure", title: "Agent settings" },
  { prefix: "/dashboard/settings", title: "Settings" },
  { prefix: "/dashboard/integrations", title: "Integrations" },
  { prefix: "/dashboard/team", title: "Team" },
  { prefix: "/dashboard/kb", title: "Memory" },
  { prefix: "/dashboard/agent", title: "Agent" },
];

function resolveRouteTitle(pathname: string): string | null {
  if (pathname === "/dashboard") return "Home";
  for (const { prefix, title } of ROUTE_TITLES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return title;
  }
  return null;
}

export function MobileHubHeader({
  onOpenNav,
}: {
  onOpenNav: () => void;
}) {
  const pathname = usePathname();
  const routeTitle = resolveRouteTitle(pathname);

  return (
    <div className="md:hidden w-full shrink-0 pt-2 pb-2">
      <div className={cn("mx-auto w-full px-5", dashboardChromeMaxWidthClass)}>
        <header
          data-dashboard-mobile-header
          className="flex w-full items-center gap-2"
        >
          <div className={cn(desktopTopBarUtilityPillClass, "shrink-0 px-3")}>
            <Logo iconOnly inPill />
          </div>

          {routeTitle ? (
            <div
              className={cn(
                desktopTopBarPillClass,
                "min-w-0 flex-1 justify-center px-4",
              )}
            >
              <span className="truncate text-sm font-semibold text-sidebar-foreground">
                {routeTitle}
              </span>
            </div>
          ) : null}

          <div className={cn(desktopTopBarUtilityPillClass, "shrink-0 gap-0.5 px-1")}>
            <HeaderSearch variant="mobile" />

            <button
              type="button"
              onClick={onOpenNav}
              aria-label="Open navigation"
              className={topBarIconButtonClass}
            >
              <Menu className="size-5" />
            </button>
          </div>
        </header>
      </div>
    </div>
  );
}
