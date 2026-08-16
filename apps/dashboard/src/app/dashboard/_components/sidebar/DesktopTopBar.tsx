"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/ui/cn";
import { inboxNavItem, integrationsNavItem, shopNavItem, teamNavItem, topBarDropdowns, type NavItem } from "../nav-items";
import { HeaderSearch } from "../header-search/HeaderSearch";
import { OpenCountBadge } from "./OpenCountBadge";
import { Logo } from "./Logo";
import { AccountNavPill } from "./AccountNavPill";
import {
  desktopTopBarPillClass,
  dashboardChromeMaxWidthClass,
  isRouteActive,
  topBarDropdownItemClass,
  topBarDropdownPanelClass,
  topBarNavTriggerClass,
} from "./sidebar-helpers";
import { WorkspaceNavPill } from "./WorkspaceNavPill";
import type { NavAuth } from "./useNavAuth";
import {
  dashboardNavPrefetchHandlers,
  useDashboardNavPrefetch,
} from "./useDashboardNavPrefetch";

function handleNavClick(e: MouseEvent<HTMLAnchorElement>, isActive: boolean) {
  if (isActive) e.preventDefault();
}

function NavDropdown({
  label,
  items,
  onNavigate,
  prefetchNav,
}: {
  label: string;
  items: readonly NavItem[];
  onNavigate: (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => void;
  prefetchNav: (href: string) => void;
}) {
  const pathname = usePathname();
  const isGroupActive = items.some((item) => isRouteActive(pathname, item.href));
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn("group", topBarNavTriggerClass(isGroupActive))}>
          <span>{label}</span>
          <ChevronDown className="size-4 text-sidebar-foreground/40 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        sideOffset={10}
        className={topBarDropdownPanelClass}
      >
        {items.map((item) => {
          const itemIsActive = isRouteActive(pathname, item.href);

          return (
            <DropdownMenuItem key={item.href} asChild className={topBarDropdownItemClass}>
              <Link
                href={item.href}
                onClick={(e) => onNavigate(e, itemIsActive)}
                {...dashboardNavPrefetchHandlers(prefetchNav, item.href)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-accent",
                  itemIsActive && "bg-accent",
                )}
              >
                <item.icon className="size-5 shrink-0 mt-0.5 stroke-[1.5] text-popover-foreground/75" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-popover-foreground leading-tight">
                    {item.name}
                  </p>
                  {item.description && (
                    <p className="mt-1 text-sm leading-snug text-muted-foreground">{item.description}</p>
                  )}
                </div>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DesktopTopBar({
  agentName,
  openCount,
  onSwitching,
  navAuth,
}: {
  agentName: string;
  openCount: number;
  onSwitching: (v: boolean) => void;
  navAuth: NavAuth;
}) {
  const pathname = usePathname();
  const prefetchNav = useDashboardNavPrefetch();
  const inboxIsActive = isRouteActive(pathname, inboxNavItem.href);
  const shopIsActive = isRouteActive(pathname, shopNavItem.href);
  const integrationsIsActive = isRouteActive(pathname, integrationsNavItem.href);
  const teamIsActive = isRouteActive(pathname, teamNavItem.href);

  return (
    <div className="hidden md:block w-full shrink-0 pt-2 pb-2 relative z-40">
      <div className={cn(
        "mx-auto flex w-full items-center gap-3 px-5 md:px-6 lg:px-8",
        dashboardChromeMaxWidthClass,
      )}>
        <header
          data-dashboard-desktop-header
          className={cn(desktopTopBarPillClass, "gap-2 px-4 shrink-0")}
        >
          <div className="flex items-center gap-1 shrink-0">
            <Logo iconOnly />

            <nav aria-label="Dashboard" className="flex items-center gap-1 shrink-0">
            <Link
              href={inboxNavItem.href}
              onClick={(e) => handleNavClick(e, inboxIsActive)}
              {...dashboardNavPrefetchHandlers(prefetchNav, inboxNavItem.href)}
              className={topBarNavTriggerClass(inboxIsActive)}
            >
              <span>{inboxNavItem.name}</span>
              {inboxNavItem.badge && (
                <OpenCountBadge
                  openCount={openCount}
                  animate
                  className="min-w-[22px] h-[22px] px-1 rounded-md text-[11px] font-bold flex items-center justify-center bg-green-600 text-background tabular-nums leading-none"
                />
              )}
            </Link>

            <Link
              href={shopNavItem.href}
              onClick={(e) => handleNavClick(e, shopIsActive)}
              {...dashboardNavPrefetchHandlers(prefetchNav, shopNavItem.href)}
              className={topBarNavTriggerClass(shopIsActive)}
            >
              <span>{shopNavItem.name}</span>
            </Link>

            {topBarDropdowns.map(({ label, items }) => (
              <NavDropdown
                key={label}
                label={label}
                items={items}
                onNavigate={handleNavClick}
                prefetchNav={prefetchNav}
              />
            ))}

            <Link
              href={integrationsNavItem.href}
              onClick={(e) => handleNavClick(e, integrationsIsActive)}
              {...dashboardNavPrefetchHandlers(prefetchNav, integrationsNavItem.href)}
              className={topBarNavTriggerClass(integrationsIsActive)}
            >
              <span>{integrationsNavItem.name}</span>
            </Link>

            <Link
              href={teamNavItem.href}
              onClick={(e) => handleNavClick(e, teamIsActive)}
              {...dashboardNavPrefetchHandlers(prefetchNav, teamNavItem.href)}
              className={topBarNavTriggerClass(teamIsActive)}
            >
              <span>{teamNavItem.name}</span>
            </Link>
          </nav>
          </div>
        </header>

        <div className="min-w-0 flex-1">
          <HeaderSearch agentName={agentName} />
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <WorkspaceNavPill navAuth={navAuth} onSwitching={onSwitching} variant="topBar" />
          <AccountNavPill navAuth={navAuth} variant="topBar" />
        </div>
      </div>
    </div>
  );
}
