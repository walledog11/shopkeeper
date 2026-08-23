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
import { inboxNavItem, shopNavItem, topBarDropdowns, type NavItem } from "../nav-items";
import { HeaderSearch } from "../header-search/HeaderSearch";
import { Logo } from "./Logo";
import { AccountNavPill } from "./AccountNavPill";
import {
  desktopTopBarPillClass,
  dashboardChromeMaxWidthClass,
  desktopTopBarUtilityPillClass,
  isRouteActive,
  topBarDropdownItemClass,
  topBarDropdownPanelClass,
  topBarNavTriggerClass,
} from "./sidebar-helpers";
import { OrganizationNavPill } from "./OrganizationNavPill";
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
  onSwitching,
  navAuth,
}: {
  onSwitching: (v: boolean) => void;
  navAuth: NavAuth;
}) {
  const pathname = usePathname();
  const prefetchNav = useDashboardNavPrefetch();
  const inboxIsActive = isRouteActive(pathname, inboxNavItem.href);
  const shopIsActive = isRouteActive(pathname, shopNavItem.href);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 hidden md:block">
      <div className={cn(
        "mx-auto flex w-full items-center gap-3 px-5 pt-2 md:px-6 lg:px-8",
        dashboardChromeMaxWidthClass,
      )}>
        <div className={cn(desktopTopBarUtilityPillClass, "pointer-events-auto shrink-0 px-3")}>
          <Logo iconOnly inPill />
        </div>

        <nav
          data-dashboard-desktop-header
          aria-label="Dashboard"
          className={cn(desktopTopBarPillClass, "pointer-events-auto gap-1 px-4 shrink-0")}
        >
          <Link
            href={inboxNavItem.href}
            onClick={(e) => handleNavClick(e, inboxIsActive)}
            {...dashboardNavPrefetchHandlers(prefetchNav, inboxNavItem.href)}
            className={topBarNavTriggerClass(inboxIsActive)}
          >
            <span>{inboxNavItem.name}</span>
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
        </nav>

        <div className="pointer-events-auto min-w-0 flex-1">
          <HeaderSearch />
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-3">
          <OrganizationNavPill navAuth={navAuth} onSwitching={onSwitching} variant="topBar" />
          <AccountNavPill navAuth={navAuth} variant="topBar" />
        </div>
      </div>
    </div>
  );
}
