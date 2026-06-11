import { Inbox, BarChart2, Users, Bot, Settings, Box, Cable, BrainCircuit, IdCardLanyard, Home, ScanEye } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: "",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: Home},
    ],
  },
  {
    label: "Support",
    items: [
      { name: "Inbox", href: "/dashboard/tickets", icon: Inbox, badge: true },
    ],
  },
  {
    label: "Automation",
    items: [
      { name: "Concierge", href: "/dashboard/agent", icon: Bot },
      { name: "Memory", href: "/dashboard/kb", icon: BrainCircuit },
    ],
  },
  {
    label: "Storefront",
    items: [
      { name: "Orders", href: "/dashboard/orders", icon: Box},
      { name: "Customers", href: "/dashboard/customers", icon: Users },
    ],
  },
  {
    label: "Insights",
    items: [
      { name: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
      { name: "Review", href: "/dashboard/review", icon: ScanEye },
    ],
  },
  {
    label: "Workspace",
    items: [
      { name: "Team", href: "/dashboard/team", icon: IdCardLanyard },
      { name: "Integrations", href: "/dashboard/integrations", icon: Cable },
    ],
  },
];

export const footerNavItems: NavItem[] = [
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];
