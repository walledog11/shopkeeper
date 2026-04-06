import { Home, Inbox, BarChart2, Users, Bot, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: boolean;
}

export const navItems: NavItem[] = [
  { name: "Home", href: "/dashboard", icon: Home },
  { name: "Tickets", href: "/dashboard/tickets", icon: Inbox, badge: true },
  { name: "Agent", href: "/dashboard/agent", icon: Bot },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
  { name: "Team", href: "/dashboard/team", icon: Users },
];

export const footerNavItems: NavItem[] = [
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];
