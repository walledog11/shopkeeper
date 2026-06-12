"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui/cn";
import { OpenCountBadge } from "./OpenCountBadge";
import { dispatchNavProgressStart, isRouteActive, mobileTabs } from "./sidebar-helpers";

export function MobileBottomBar({ openCount, agentName }: { openCount: number; agentName: string }) {
  const pathname = usePathname();

  return (
    <div
      data-dashboard-mobile-bottom-bar
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-neutral-950 border-t border-white/[0.08] flex items-stretch"
    >
      {mobileTabs.map((tab) => {
        const isActive = isRouteActive(pathname, tab.href);

        return (
          <Link
            key={tab.name}
            href={tab.href}
            onClick={(e) => {
              if (isActive) {
                e.preventDefault();
                return;
              }
              dispatchNavProgressStart();
            }}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 relative transition-colors",
              isActive ? "text-white" : "text-white/70",
            )}
          >
            {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-sky-400" />}
            <div className="relative">
              <tab.icon className="size-5" />
              {tab.badge && (
                <OpenCountBadge
                  openCount={openCount}
                  className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full text-xs font-bold flex items-center justify-center bg-green-400 text-black tabular-nums leading-none"
                />
              )}
            </div>
            <span className="text-xs font-medium leading-none">{tab.href === "/dashboard/agent" ? agentName : tab.name}</span>
          </Link>
        );
      })}
    </div>
  );
}
