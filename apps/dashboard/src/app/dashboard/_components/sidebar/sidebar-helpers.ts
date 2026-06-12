import { Box, Inbox, Settings } from "lucide-react";

export const mobileTabs = [
  { name: "Inbox", href: "/dashboard/tickets", icon: Inbox, badge: true },
  { name: "Orders", href: "/dashboard/orders", icon: Box, badge: false },
  { name: "Settings", href: "/dashboard/settings", icon: Settings, badge: false },
];

export function isRouteActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

export function formatOpenCount(openCount: number) {
  return openCount > 9 ? "9+" : openCount;
}

export function dispatchNavProgressStart() {
  window.dispatchEvent(new Event("nav-progress-start"));
}
