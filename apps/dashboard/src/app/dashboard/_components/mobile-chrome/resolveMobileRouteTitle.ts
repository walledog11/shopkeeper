import { activeSettingsSection } from "../nav-items";

const ROUTE_TITLES: { prefix: string; title: string }[] = [
  { prefix: "/dashboard/tickets", title: "Inbox" },
  { prefix: "/dashboard/orders", title: "Shop" },
  { prefix: "/dashboard/chat", title: "Website chat" },
  { prefix: "/dashboard/review", title: "Review" },
  { prefix: "/dashboard/settings", title: "Settings" },
  { prefix: "/dashboard/kb", title: "Memory" },
  { prefix: "/dashboard/agent", title: "Agent" },
];

export function resolveMobileRouteTitle(pathname: string): string {
  if (pathname === "/dashboard") return "Home";
  if (activeSettingsSection(pathname)) return "Settings";
  for (const { prefix, title } of ROUTE_TITLES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return title;
  }
  return "Menu";
}
