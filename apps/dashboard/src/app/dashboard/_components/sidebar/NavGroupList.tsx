"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { cn } from "@/lib/ui/cn";
import { navSections } from "../nav-items";
import { OpenCountBadge } from "./OpenCountBadge";
import { isRouteActive } from "./sidebar-helpers";

export function NavGroupList({
  pathname,
  openCount,
  onNavigate,
}: {
  pathname: string;
  openCount: number;
  onNavigate: (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => void;
}) {
  return (
    <>
      {navSections.map((items, sectionIndex) => (
        <div key={sectionIndex} className={sectionIndex > 0 ? "mt-3 pt-3 border-t border-border" : ""}>
          <div className="flex flex-col gap-0.5">
            {items.map((item) => {
              const isActive = isRouteActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={(e) => onNavigate(e, isActive)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/80",
                  )}
                >
                  <item.icon className="w-[16px] h-[18px] shrink-0 mr-1 stroke-1" />
                  <span className="text-sm">{item.name}</span>
                  {item.badge && (
                    <OpenCountBadge
                      openCount={openCount}
                      className="ml-auto min-w-[20px] h-5 px-1.5 rounded-lg text-xs font-bold flex items-center justify-center bg-green-400 text-black tabular-nums"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
