"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { cn } from "@/lib/ui/cn";
import type { NavItem, NavSection } from "../nav-items";
import { OpenCountBadge } from "./OpenCountBadge";
import {
  inboxOpenCountBadgeClass,
  isRouteActive,
  mobileNavGroupCardClass,
  mobileNavLinkClass,
  reviewCountBadgeClass,
} from "./sidebar-helpers";
import {
  dashboardNavPrefetchHandlers,
  useDashboardNavPrefetch,
} from "./useDashboardNavPrefetch";

function itemBadgeCount(item: NavItem, needsYouCount: number, openCount: number): number | null {
  if (item.href === "/dashboard/review" && needsYouCount > 0) return needsYouCount;
  if (item.badge && openCount > 0) return openCount;
  return null;
}

export function NavGroupList({
  sections,
  pathname,
  needsYouCount,
  openCount = 0,
  onNavigate,
}: {
  sections: NavSection[];
  pathname: string;
  needsYouCount: number;
  openCount?: number;
  onNavigate: (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => void;
}) {
  const prefetchNav = useDashboardNavPrefetch();

  return (
    <div className="flex flex-col gap-5">
      {sections.map((section) => {
        const heading = section.heading;

        return (
          <div key={heading} className="flex flex-col gap-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
              {heading}
            </p>
            <div className={mobileNavGroupCardClass}>
              {section.items.map((item) => {
                const isActive = isRouteActive(pathname, item.href);
                const badgeCount = itemBadgeCount(item, needsYouCount, openCount);
                const label = item.mobileName ?? item.name;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={(e) => onNavigate(e, isActive)}
                    {...dashboardNavPrefetchHandlers(prefetchNav, item.href)}
                    className={mobileNavLinkClass(isActive)}
                  >
                    <item.icon
                      className={cn(
                        "size-[18px] shrink-0 stroke-[1.5]",
                        isActive ? "text-sidebar-foreground" : "text-sidebar-foreground/70",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-tight">{label}</p>
                    </div>
                    {badgeCount != null && (
                      <OpenCountBadge
                        openCount={badgeCount}
                        animate={item.badge}
                        className={item.badge ? inboxOpenCountBadgeClass : reviewCountBadgeClass}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
