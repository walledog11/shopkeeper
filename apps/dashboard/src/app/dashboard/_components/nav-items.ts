import { Inbox, BarChart2, Users, Bot, Settings, BookOpen, UserCircle, MessageSquare, MessageCircle, NotebookTabs, Box, ShoppingBasket, ClipboardMinus, Cable, MessageSquareDashed, BrainCircuit, IdCardLanyard, MessageSquareCode, Activity, Home } from "lucide-react";
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
      { name: "Saved Replies", href: "/dashboard/canned-responses", icon: MessageSquareDashed },
    ],
  },
  {
    label: "Automation",
    items: [
      { name: "Concierge", href: "/dashboard/agent", icon: Bot },
      { name: "Memory", href: "/dashboard/kb", icon: BrainCircuit },
      { name: "Playbooks", href: "/dashboard/playbooks", icon: BookOpen },
    ],
  },
  {
    label: "Storefront",
    items: [
      { name: "Orders", href: "/dashboard/orders", icon: Box},
      { name: "Customers", href: "/dashboard/customers", icon: Users },
      { name: "Products", href: "/dashboard/products", icon: ShoppingBasket },

    ],
  },
  {
    label: "Insights",
    items: [
      { name: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
      { name: "Activity", href: "/dashboard/activity", icon: Activity },
      { name: "Reports", href: "/dashboard/reports", icon: ClipboardMinus },
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

export const navItems: NavItem[] = navGroups.flatMap((g) => g.items);

export const footerNavItems: NavItem[] = [
  { name: "Feedback", href: "/dashboard/feedback", icon: MessageSquareCode },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];
