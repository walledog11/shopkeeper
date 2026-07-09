"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/ui/cn";
import AgentAvatar from "@/components/agent/AgentAvatar";
import { useAgentPanel } from "../agent-panel/AgentPanelContext";
import { useCommandPalette } from "../CommandPaletteContext";
import { inboxNavItem, topBarDropdowns, type NavItem } from "../nav-items";
import { OpenCountBadge } from "./OpenCountBadge";
import { Logo } from "./Logo";
import { OrgSwitcher } from "./OrgSwitcher";
import {
  dispatchNavProgressStart,
  isRouteActive,
  topBarDropdownItemClass,
  topBarDropdownPanelClass,
  topBarNavTriggerClass,
} from "./sidebar-helpers";
import { UserAvatarLink } from "./UserAvatarLink";
import type { NavAuth } from "./useNavAuth";

function handleNavClick(e: MouseEvent<HTMLAnchorElement>, isActive: boolean) {
  if (isActive) {
    e.preventDefault();
    return;
  }
  dispatchNavProgressStart();
}

function NavDropdown({
  label,
  items,
  onNavigate,
}: {
  label: string;
  items: readonly NavItem[];
  onNavigate: (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => void;
}) {
  const pathname = usePathname();
  const isGroupActive = items.some((item) => isRouteActive(pathname, item.href));
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openMenu = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => () => clearCloseTimer(), []);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger
        asChild
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
      >
        <button type="button" className={cn("group", topBarNavTriggerClass(isGroupActive))}>
          <span>{label}</span>
          <ChevronDown className="size-3.5 text-sidebar-foreground/40 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        sideOffset={10}
        className={topBarDropdownPanelClass}
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
      >
        {items.map((item) => {
          const itemIsActive = isRouteActive(pathname, item.href);

          return (
            <DropdownMenuItem key={item.href} asChild className={topBarDropdownItemClass}>
              <Link
                href={item.href}
                onClick={(e) => onNavigate(e, itemIsActive)}
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
  const { open: openCmd } = useCommandPalette();
  const { open: openAgentPanel } = useAgentPanel();
  const inboxIsActive = isRouteActive(pathname, inboxNavItem.href);

  return (
    <header
      data-dashboard-desktop-header
      className="relative hidden md:flex items-center gap-2 px-4 h-14 border-b border-border shrink-0 bg-sidebar"
    >
      <div className="flex items-center shrink-0">
        <Logo iconOnly />
      </div>

      <nav
        aria-label="Dashboard"
        className="flex items-center gap-0.5 shrink-0 mx-auto lg:absolute lg:left-1/2 lg:-translate-x-1/2"
      >
        <Link
          href={inboxNavItem.href}
          onClick={(e) => handleNavClick(e, inboxIsActive)}
          className={topBarNavTriggerClass(inboxIsActive)}
        >
          <span>{inboxNavItem.name}</span>
          {inboxNavItem.badge && (
            <OpenCountBadge
              openCount={openCount}
              animate
              className="min-w-[18px] h-[18px] px-1 rounded-md text-[10px] font-bold flex items-center justify-center bg-green-400 text-black tabular-nums leading-none"
            />
          )}
        </Link>

        {topBarDropdowns.map(({ label, items }) => (
          <NavDropdown
            key={label}
            label={label}
            items={items}
            onNavigate={handleNavClick}
          />
        ))}

      </nav>

      <div className="flex items-center gap-2 shrink-0 lg:ml-auto">
        <button
          type="button"
          onClick={() => openAgentPanel({ source: "command" })}
          aria-label="Open agent"
          title="Open agent"
          className="flex items-center justify-center p-0.5 rounded-full border border-border bg-white hover:bg-white/90 transition-colors shrink-0"
        >
          <AgentAvatar agentName={agentName} size="sm" imageSrc="/logos/coco-header-icon.png" />
        </button>

        <button
          type="button"
          onClick={openCmd}
          aria-label="Search"
          className="flex items-center justify-center xl:justify-start gap-2 h-9 w-9 xl:h-auto xl:w-44 2xl:w-52 xl:px-3 xl:py-1.5 rounded-md border border-border bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none shrink-0"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="hidden xl:block flex-1 text-sm text-left truncate">Search</span>
          <kbd className="hidden xl:inline text-[10px] font-semibold bg-secondary px-1.5 py-0.5 rounded text-muted-foreground leading-none">
            ⌘K
          </kbd>
        </button>

        <OrgSwitcher navAuth={navAuth} onSwitching={onSwitching} variant="topBar" />
        <UserAvatarLink navAuth={navAuth} variant="topBar" />
      </div>
    </header>
  );
}
