"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/ui/cn";
import AgentAvatar from "../agent-panel/AgentAvatar";
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
import { UserMenu } from "./UserMenu";
import type { NavAuth } from "./useNavAuth";

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn("group", topBarNavTriggerClass(isGroupActive))}>
          <span>{label}</span>
          <ChevronDown className="size-3.5 text-sidebar-foreground/40 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" sideOffset={10} className={topBarDropdownPanelClass}>
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

  const handleNavClick = (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => {
    if (isActive) {
      e.preventDefault();
      return;
    }
    dispatchNavProgressStart();
  };

  return (
    <header
      data-dashboard-desktop-header
      className="hidden md:grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-4 h-14 border-b border-border shrink-0 bg-sidebar min-w-0"
    >
      <div className="flex items-center min-w-0">
        <Logo iconOnly />
      </div>

      <nav aria-label="Dashboard" className="flex items-center gap-0.5 justify-self-center">
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

      <div className="flex items-center gap-2 justify-self-end min-w-0">
        <button
          type="button"
          onClick={() => openAgentPanel({ source: "command" })}
          title={`Chat with ${agentName}`}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-border bg-card hover:bg-muted/60 text-foreground transition-colors shrink-0"
        >
          <AgentAvatar agentName={agentName} size="sm" />
          <span className="text-sm font-semibold truncate max-w-[120px]">{agentName}</span>
        </button>

        <button
          type="button"
          onClick={openCmd}
          className="flex items-center gap-2 w-44 lg:w-52 px-3 py-1.5 rounded-md border border-border bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1 text-sm text-left truncate">Search</span>
          <kbd className="text-[10px] font-semibold bg-secondary px-1.5 py-0.5 rounded text-muted-foreground leading-none">
            ⌘K
          </kbd>
        </button>

        <OrgSwitcher navAuth={navAuth} onSwitching={onSwitching} variant="topBar" />
        <UserMenu navAuth={navAuth} variant="topBar" />
      </div>
    </header>
  );
}
