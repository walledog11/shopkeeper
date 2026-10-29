import { Inbox, Settings2, Box, BrainCircuit, Home, ScanEye, User, MessageCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { isRouteActive } from "./sidebar/sidebar-helpers";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  description?: string;
  /** Friendlier label for mobile overflow nav */
  mobileName?: string;
}

export interface NavSection {
  heading: string;
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
};

export const topBarAgentItems: NavItem[] = [
  {
    name: "Memory",
    href: "/dashboard/kb",
    icon: BrainCircuit,
    description: "Facts, policies, and learned answers",
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
  description: "Orders that need a look",
};

export const topBarShopItems: NavItem[] = [shopNavItem];

export const chatNavItem: NavItem = {
  name: "Chat",
  mobileName: "Website chat",
  href: "/dashboard/chat",
  icon: MessageCircle,
  description: "Customize the chat on your website",
};

export const accountSettingsNavItem: NavItem = {
  name: "Account",
  mobileName: "Account settings",
  href: "/dashboard/account",
  icon: User,
  description: "Profile, sign-in, and logout",
};

export interface SettingsSection {
  id: string;
  label: string;
  href: string;
}

/**
 * Every settings page, in rail order. Channels, Team and Account keep the URLs
 * they had before Settings had one home; the (settings) route group gives them
 * its layout without moving them.
 */
export const settingsSectionGroups: { heading: string; sections: SettingsSection[] }[] = [
  {
    heading: "Store",
    sections: [
      { id: "general", label: "General", href: "/dashboard/settings/general" },
      { id: "store-profile", label: "Store profile", href: "/dashboard/settings/store-profile" },
      { id: "approvals", label: "Approvals & limits", href: "/dashboard/settings/approvals" },
      { id: "hours", label: "Hours & away", href: "/dashboard/settings/hours" },
      { id: "briefing", label: "Phone & briefing", href: "/dashboard/settings/briefing" },
      { id: "channels", label: "Channels", href: "/dashboard/integrations" },
      { id: "team", label: "Team", href: "/dashboard/team" },
      { id: "billing", label: "Usage & billing", href: "/dashboard/settings/billing" },
      { id: "data", label: "Data & privacy", href: "/dashboard/settings/data" },
    ],
  },
  {
    heading: "You",
    sections: [
      { id: "account", label: "Account", href: "/dashboard/account" },
    ],
  },
];

export const settingsSections: SettingsSection[] = settingsSectionGroups.flatMap(group => group.sections);

export function settingsSectionHref(id: string): string {
  const section = settingsSections.find(candidate => candidate.id === id);
  if (!section) throw new Error(`Unknown settings section: ${id}`);
  return section.href;
}

export function activeSettingsSection(pathname: string): SettingsSection | null {
  return settingsSections.find(section => isRouteActive(pathname, section.href)) ?? null;
}

export const settingsNavItem: NavItem = {
  name: "Settings",
  href: settingsSectionHref("general"),
  icon: Settings2,
  description: "Your store, approvals, channels, team, and billing",
};

/** The Settings item stands for every settings page, not only the one it opens. */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  return item === settingsNavItem
    ? activeSettingsSection(pathname) !== null
    : isRouteActive(pathname, item.href);
}

export const topBarDropdowns = [
  { label: "Agent", items: topBarAgentItems },
] as const;

/** Mobile nav sections (logo links home). */
export const mobileNavSections: NavSection[] = [
  { heading: "Today", items: [inboxNavItem] },
  { heading: "Shop", items: [shopNavItem, chatNavItem] },
  {
    heading: "Shopkeeper",
    items: [
      topBarAgentItems[1],
      topBarAgentItems[0],
    ],
  },
  { heading: "Workspace", items: [settingsNavItem] },
];
