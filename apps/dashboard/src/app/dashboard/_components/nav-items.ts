import { Inbox, Users, Settings, Box, Cable, BrainCircuit, IdCardLanyard, Home, ScanEye, SlidersHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: boolean;
  description?: string;
}

export const homeNavItem: NavItem = {
  name: "Home",
  href: "/dashboard",
  icon: Home,
};

export const inboxNavItem: NavItem = {
  name: "Inbox",
  href: "/dashboard/tickets",
  icon: Inbox,
  badge: true,
};

export const topBarAgentItems: NavItem[] = [
  {
    name: "Configure",
    href: "/dashboard/agent/configure",
    icon: SlidersHorizontal,
    description: "Autonomy, voice, and guardrails",
  },
  {
    name: "Memory",
    href: "/dashboard/kb",
    icon: BrainCircuit,
    description: "Knowledge base and brand context",
  },
  {
    name: "Review",
    href: "/dashboard/review",
    icon: ScanEye,
    description: "Approve and refine agent responses",
  },
];

export const topBarShopItems: NavItem[] = [
  {
    name: "Orders",
    href: "/dashboard/orders",
    icon: Box,
    description: "Track and fulfill customer orders",
  },
  {
    name: "Customers",
    href: "/dashboard/customers",
    icon: Users,
    description: "Profiles, history, and segments",
  },
];

export const topBarSettingsItems: NavItem[] = [
  {
    name: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
    description: "Workspace and billing",
  },
  {
    name: "Integrations",
    href: "/dashboard/integrations",
    icon: Cable,
    description: "Connect channels and external tools",
  },
  {
    name: "Team",
    href: "/dashboard/team",
    icon: IdCardLanyard,
    description: "Members, roles, and access",
  },
];

export const topBarDropdowns = [
  { label: "Agent", items: topBarAgentItems },
  { label: "Shop", items: topBarShopItems },
  { label: "Settings", items: topBarSettingsItems },
] as const;

/** Mobile sheet: daily routes, then workspace upkeep. */
export const navSections: NavItem[][] = [
  [homeNavItem, inboxNavItem, ...topBarShopItems],
  [...topBarAgentItems, ...topBarSettingsItems.slice().reverse()],
];

export const commandPaletteSections = [
  { heading: "Inbox", items: [inboxNavItem] },
  { heading: "Agent", items: topBarAgentItems },
  { heading: "Shop", items: topBarShopItems },
  { heading: "Settings", items: topBarSettingsItems },
] as const;
