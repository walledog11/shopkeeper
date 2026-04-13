import { Inbox, BarChart2, Users, Bot, Settings, BookOpen, UserCircle, MessageSquare, MessageCircle } from "lucide-react";
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
    label: "Support",
    items: [
      { name: "Inbox", href: "/dashboard/tickets", icon: Inbox, badge: true },
      { name: "AI Agent", href: "/dashboard/agent", icon: Bot },
      { name: "Knowledge Base", href: "/dashboard/kb", icon: BookOpen },
      { name: "Canned Responses", href: "/dashboard/canned-responses", icon: MessageSquare },
    ],
  },
  {
    label: "Insights",
    items: [
      { name: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
    ],
  },
  {
    label: "People",
    items: [
      { name: "Customers", href: "/dashboard/customers", icon: UserCircle },
      { name: "Team", href: "/dashboard/team", icon: Users },
    ],
  },
];

export const navItems: NavItem[] = navGroups.flatMap((g) => g.items);

export const footerNavItems: NavItem[] = [
  { name: "Feedback", href: "/dashboard/feedback", icon: MessageCircle },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];
