"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { cn } from "@/lib/ui/cn";
import type { NavSection } from "../nav-items";
import { formatOpenCount, isRouteActive } from "./sidebar-helpers";

function itemBadgeCount(href: string, needsYouCount: number): number | null {
  if (href === "/dashboard/review" && needsYouCount > 0) return needsYouCount;
  return null;
}

export function NavGroupList({
  sections,
  agentName,
  pathname,
  needsYouCount,
  onNavigate,
}: {
  sections: NavSection[];
  agentName: string;
  pathname: string;
  needsYouCount: number;
  onNavigate: (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {sections.map((section) => {
        const heading = section.useAgentName ? agentName : section.heading;

        return (
          <div key={heading} className="flex flex-col gap-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/40">
              {heading}
            </p>
            <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
              {section.items.map((item) => {
                const isActive = isRouteActive(pathname, item.href);
                const badgeCount = itemBadgeCount(item.href, needsYouCount);
                const label = item.mobileName ?? item.name;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={(e) => onNavigate(e, isActive)}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3.5 transition-colors",
                      isActive
                        ? "bg-foreground/[0.04]"
                        : "hover:bg-foreground/[0.03]",
                    )}
                  >
                    <item.icon
                      className={cn(
                        "size-[18px] shrink-0 mt-0.5 stroke-[1.5]",
                        isActive ? "text-foreground" : "text-foreground/50",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm leading-tight",
                          isActive ? "font-semibold text-foreground" : "font-medium text-foreground/85",
                        )}
                      >
                        {label}
                      </p>
                      {item.description && (
                        <p className="mt-0.5 text-xs leading-snug text-foreground/45">{item.description}</p>
                      )}
                    </div>
                    {badgeCount != null && (
                      <span className="ml-1 min-w-[20px] h-5 px-1.5 rounded-lg text-xs font-bold flex items-center justify-center bg-amber-500/15 text-amber-800 tabular-nums shrink-0">
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
