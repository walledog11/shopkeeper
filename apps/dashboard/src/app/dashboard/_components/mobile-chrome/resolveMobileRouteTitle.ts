const ROUTE_TITLES: { prefix: string; title: string }[] = [
  { prefix: "/dashboard/tickets", title: "Inbox" },
  { prefix: "/dashboard/orders", title: "Shop" },
  { prefix: "/dashboard/review", title: "Review" },
  { prefix: "/dashboard/agent/configure", title: "Agent settings" },
  { prefix: "/dashboard/settings", title: "Settings" },
  { prefix: "/dashboard/integrations", title: "Integrations" },
  { prefix: "/dashboard/team", title: "Team" },
  { prefix: "/dashboard/kb", title: "Memory" },
  { prefix: "/dashboard/agent", title: "Agent" },
];

export function resolveMobileRouteTitle(pathname: string): string {
  if (pathname === "/dashboard") return "Home";
  for (const { prefix, title } of ROUTE_TITLES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return title;
  }
  return "Menu";
}
