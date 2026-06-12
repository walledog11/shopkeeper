"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/ui/cn";
import { navGroups } from "../nav-items";
import { OpenCountBadge } from "./OpenCountBadge";
import { isRouteActive } from "./sidebar-helpers";

export function NavGroupList({
  pathname,
  openCount,
  onNavigate,
  variant,
  agentName,
}: {
  pathname: string;
  openCount: number;
  onNavigate: (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => void;
  variant: "desktop" | "mobile";
  agentName: string;
}) {
  // The agent is listed by its configured name, like any other teammate.
  const itemLabel = (item: { name: string; href: string }) =>
    item.href === "/dashboard/agent" ? agentName : item.name;

  if (variant === "mobile") {
    return (
      <>
        {navGroups.map((group, i) => (
          <div key={group.label || "home"} className={i > 0 ? "mt-4" : ""}>
            {group.label && (
              <p className="text-[0.65rem] font-bold tracking-widest uppercase text-white/30 px-3 mb-1">
                {group.label}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = isRouteActive(pathname, item.href);

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={(e) => onNavigate(e, isActive)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                      isActive ? "bg-white/[0.12] text-white font-medium" : "text-white/60 hover:text-white hover:bg-white/[0.06]",
                    )}
                  >
                    <item.icon className="w-[16px] h-[18px] shrink-0 mr-1 stroke-1" />
                    <span className="text-sm">{itemLabel(item)}</span>
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

  return (
    <>
      {navGroups.map((group, i) => (
        <div key={group.label || "home"} className={i > 0 ? "mt-3" : ""}>
          {group.label && (
            <div className="flex items-center px-3 mb-1 gap-1">
              <p className="text-[0.7rem] font-bold tracking-wide uppercase text-white/[0.35] whitespace-nowrap">
                {group.label}
              </p>
            </div>
          )}
          <SidebarMenu>
            {group.items.map((item) => {
              const isActive = isRouteActive(pathname, item.href);

              return (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    className="rounded-md h-auto py-1 px-3 text-sm font-light leading-snug text-white/60 hover:text-white hover:bg-white/[0.05] data-[active=true]:bg-white/[0.06] data-[active=true]:text-white data-[active=true]:font-medium"
                  >
                    <Link href={item.href} onClick={(e) => onNavigate(e, isActive)}>
                      <item.icon className="size-[10px] shrink-0 stroke-1 mr-1" />
                      <span>{itemLabel(item)}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.badge && openCount > 0 && (
                    <SidebarMenuBadge className="pointer-events-none">
                      <OpenCountBadge
                        openCount={openCount}
                        animate
                        className="min-w-[20px] h-5 px-1.5 rounded-lg text-xs font-bold flex items-center justify-center bg-green-400 text-black tabular-nums animate-in zoom-in-75 duration-150"
                      />
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </div>
      ))}
    </>
  );
}
