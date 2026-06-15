import { Inbox, Settings, Box, Cable, BrainCircuit, IdCardLanyard, Home, ScanEye, SlidersHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: boolean;
  description?: string;
  /** Friendlier label for mobile overflow nav */
  mobileName?: string;
}

export interface NavSection {
  heading: string;
  /** When true, the section heading is replaced with the agent name at render time */
  useAgentName?: boolean;
  items: NavItem[];
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
    mobileName: "Agent settings",
    href: "/dashboard/agent/configure",
    icon: SlidersHorizontal,
    description: "Autonomy, voice, and guardrails",
  },
  {
    name: "Memory",
    mobileName: "Knowledge",
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

export const shopNavItem: NavItem = {
  name: "Shop",
  href: "/dashboard/orders",
  icon: Box,
  description: "Orders and customers from Shopify",
};

export const topBarShopItems: NavItem[] = [shopNavItem];

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

/** Mobile overflow nav — excludes routes in the bottom tab bar (Inbox, Shop, Settings). */
export const mobileNavSections: NavSection[] = [
  { heading: "Today", items: [homeNavItem] },
  {
    heading: "Agent",
    useAgentName: true,
    items: [
      topBarAgentItems[2],
      topBarAgentItems[1],
      topBarAgentItems[0],
    ],
  },
  {
    heading: "Workspace",
    items: [topBarSettingsItems[2], topBarSettingsItems[1]],
  },
];

export const commandPaletteSections = [
  { heading: "Inbox", items: [inboxNavItem] },
  { heading: "Agent", items: topBarAgentItems },
  { heading: "Shop", items: topBarShopItems },
  { heading: "Settings", items: topBarSettingsItems },
] as const;
