import { Inbox, Settings2, Box, BrainCircuit, ScanEye, User, MessageCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
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

export const inboxNavItem: NavItem = {
  name: "Inbox",
  href: "/dashboard/tickets",
  icon: Inbox,
};

export const memoryNavItem: NavItem = {
  name: "Memory",
  href: "/dashboard/kb",
  icon: BrainCircuit,
  description: "Store profile, brand voice, preferences, and notes",
};

export const reviewNavItem: NavItem = {
  name: "Review",
  href: "/dashboard/review",
  icon: ScanEye,
  description: "Approve and refine agent responses",
};

const topBarAgentItems: NavItem[] = [memoryNavItem, reviewNavItem];

export const shopNavItem: NavItem = {
  name: "Shop",
  href: "/dashboard/orders",
  icon: Box,
  description: "Orders that need a look",
};

// "Website chat", not "Chat": the page sets up the chat on the store's site, and
// "Chat" read as the place to talk to the agent, which is the ask box.
export const chatNavItem: NavItem = {
  name: "Website chat",
  href: "/dashboard/chat",
  icon: MessageCircle,
  description: "Customize the chat on your website",
};

export const accountSettingsNavItem: NavItem = {
  name: "Account",
  mobileName: "Your login",
  href: "/dashboard/account",
  icon: User,
  description: "Profile, sign-in, and logout",
};

export interface SettingsPage {
  label: string;
  href: string;
}

export interface SettingsSection extends SettingsPage {
  id: string;
  /** Pages reached from the section's own page, shown in the rail as the section. */
  pages?: SettingsPage[];
}

/**
 * Every settings section, in rail order: four questions a shop owner can
 * answer, then Channels, which is setup rather than a setting. Pages keep the
 * URLs they had before; the (settings) route group gives them its layout.
 */
export const settingsSectionGroups: { heading: string; sections: SettingsSection[] }[] = [
  {
    heading: "Settings",
    sections: [
      { id: "voice", label: "How it sounds", href: "/dashboard/voice" },
      { id: "approvals", label: "What it can do on its own", href: "/dashboard/settings/approvals" },
      { id: "briefing", label: "When and where it reaches you", href: "/dashboard/settings/briefing" },
      {
        id: "billing",
        label: "Account & billing",
        href: "/dashboard/settings/billing",
        pages: [
          { label: "Team", href: "/dashboard/team" },
          { label: "Your data", href: "/dashboard/settings/data" },
          { label: "Your login", href: "/dashboard/account" },
        ],
      },
    ],
  },
  {
    heading: "Setup",
    sections: [
      { id: "channels", label: "Channels", href: "/dashboard/integrations" },
    ],
  },
];

export const settingsSections: SettingsSection[] = settingsSectionGroups.flatMap(group => group.sections);

function settingsSection(id: string): SettingsSection {
  const section = settingsSections.find(candidate => candidate.id === id);
  if (!section) throw new Error(`Unknown settings section: ${id}`);
  return section;
}

export function settingsSectionHref(id: string): string {
  return settingsSection(id).href;
}

/** A settings page's browser tab title: its label in the rail. */
export function settingsSectionMetadata(id: string): Metadata {
  return { title: settingsSection(id).label };
}

export function activeSettingsSection(pathname: string): SettingsSection | null {
  return settingsSections.find(section => (
    isRouteActive(pathname, section.href)
    || section.pages?.some(page => isRouteActive(pathname, page.href))
  )) ?? null;
}

/** The page under a section the path is on, when it isn't the section's own page. */
export function activeSettingsSubpage(pathname: string): SettingsPage | null {
  return activeSettingsSection(pathname)?.pages?.find(page => isRouteActive(pathname, page.href)) ?? null;
}

export const settingsNavItem: NavItem = {
  name: "Settings",
  href: settingsSectionHref("voice"),
  icon: Settings2,
  description: "How it sounds, what it may do, how it reaches you, and billing",
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

/**
 * Mobile nav sections (logo links home). Website chat is listed only while the
 * platform switch (`STOREFRONT_CHAT_ENABLED`) is on, as in the desktop bar.
 */
export const mobileNavSections = (websiteChat: boolean): NavSection[] => [
  { heading: "Today", items: [inboxNavItem] },
  { heading: "Shop", items: websiteChat ? [shopNavItem, chatNavItem] : [shopNavItem] },
  {
    heading: "Shopkeeper",
    items: [reviewNavItem, memoryNavItem],
  },
  { heading: "Workspace", items: [settingsNavItem] },
];
