"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { cn } from "@/lib/ui/cn";
import type { NavItem, NavSection } from "../nav-items";
import { formatOpenCount, isRouteActive } from "./sidebar-helpers";

function itemBadgeCount(item: NavItem, needsYouCount: number, openCount: number): number | null {
  if (item.href === "/dashboard/review" && needsYouCount > 0) return needsYouCount;
  if (item.badge && openCount > 0) return openCount;
  return null;
}

export function NavGroupList({
  sections,
  agentName,
  pathname,
  needsYouCount,
  openCount = 0,
  onNavigate,
}: {
  sections: NavSection[];
  agentName: string;
  pathname: string;
  needsYouCount: number;
  openCount?: number;
  onNavigate: (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {sections.map((section) => {
        const heading = section.useAgentName ? agentName : section.heading;

        return (
          <div key={heading} className="flex flex-col gap-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
              {heading}
            </p>
            <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
              {section.items.map((item) => {
                const isActive = isRouteActive(pathname, item.href);
                const badgeCount = itemBadgeCount(item, needsYouCount, openCount);
                const label = item.mobileName ?? item.name;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={(e) => onNavigate(e, isActive)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3.5 transition-colors",
                      isActive
                        ? "bg-foreground/[0.04]"
                        : "hover:bg-foreground/[0.03]",
                    )}
                  >
                    <item.icon
                      className={cn(
                        "size-[18px] shrink-0 stroke-[1.5]",
                        isActive ? "text-foreground" : "text-muted-foreground",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm leading-tight",
                          isActive ? "font-semibold text-foreground" : "font-medium text-strong",
                        )}
                      >
                        {label}
                      </p>
                    </div>
                    {badgeCount != null && (
                      <span
                        className={cn(
                          "ml-1 min-w-[20px] h-5 px-1.5 rounded-lg text-xs font-bold flex items-center justify-center tabular-nums shrink-0",
                          item.badge
                            ? "bg-green-400/15 text-green-800"
                            : "bg-amber-500/15 text-amber-800",
                        )}
                      >
                        {formatOpenCount(badgeCount)}
                      </span>
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
