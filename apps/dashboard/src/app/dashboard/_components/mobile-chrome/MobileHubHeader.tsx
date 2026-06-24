"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import AgentAvatar from "../agent-panel/AgentAvatar";
import { useAgentPanel } from "../agent-panel/AgentPanelContext";
import { Logo } from "../sidebar/Logo";

const ROUTE_TITLES: { prefix: string; title: string }[] = [
  { prefix: "/dashboard/tickets", title: "Inbox" },
  { prefix: "/dashboard/orders", title: "Shop" },
  { prefix: "/dashboard/review", title: "Review" },
  { prefix: "/dashboard/settings", title: "Settings" },
  { prefix: "/dashboard/integrations", title: "Integrations" },
  { prefix: "/dashboard/team", title: "Team" },
  { prefix: "/dashboard/kb", title: "Memory" },
  { prefix: "/dashboard/agent", title: "Agent" },
  { prefix: "/dashboard/account", title: "Account" },
];

function resolveRouteTitle(pathname: string): string | null {
  if (pathname === "/dashboard") return "Home";
  for (const { prefix, title } of ROUTE_TITLES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return title;
  }
  return null;
}

export function MobileHubHeader({
  agentName,
  onOpenNav,
}: {
  agentName: string;
  onOpenNav: () => void;
}) {
  const pathname = usePathname();
  const { open: openAgentPanel } = useAgentPanel();
  const routeTitle = resolveRouteTitle(pathname);

  return (
    <div
      data-dashboard-mobile-header
      className="md:hidden relative flex items-center justify-between px-4 h-14 border-b border-border shrink-0 bg-sidebar"
    >
      <Logo iconOnly />

      {routeTitle ? (
        <span className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-foreground/85 pointer-events-none">
          {routeTitle}
        </span>
      ) : null}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => openAgentPanel({ source: "command" })}
          aria-label="Open agent"
          title="Open agent"
          className="p-0.5 rounded-full border border-border bg-white hover:bg-white/90 transition-colors"
        >
          <AgentAvatar agentName={agentName} size="sm" imageSrc="/logos/coco-header-icon.png" />
        </button>

        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="p-2 rounded-md text-foreground/60 hover:text-white hover:bg-foreground/[0.08] transition-colors"
        >
          <Menu className="size-5" />
        </button>
      </div>
    </div>
  );
}
