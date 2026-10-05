export interface DashboardDestination {
  id: string;
  href: string;
  label: string;
  description: string;
}

export const DASHBOARD_DESTINATIONS: readonly DashboardDestination[] = [
  {
    id: "home",
    href: "/dashboard",
    label: "Home",
    description: "Dashboard home and daily briefing",
  },
  {
    id: "inbox",
    href: "/dashboard/tickets",
    label: "Inbox",
    description: "Support tickets and customer conversations",
  },
  {
    id: "integrations",
    href: "/dashboard/integrations",
    label: "Integrations",
    description: "Connect email, Instagram, iMessage, and other channels",
  },
  {
    id: "agent_settings",
    href: "/dashboard/agent/configure",
    label: "Agent configure",
    description: "Store identity, trust level, brand voice, and autonomy",
  },
  {
    id: "memory",
    href: "/dashboard/kb",
    label: "Memory",
    description: "Facts, policies, and learned answers",
  },
  {
    id: "review",
    href: "/dashboard/review",
    label: "Review",
    description: "Approve and refine agent responses",
  },
  {
    id: "orders",
    href: "/dashboard/orders",
    label: "Shop",
    description: "Orders that need a look",
  },
  {
    id: "workspace_settings",
    href: "/dashboard/settings",
    label: "Workspace settings",
    description: "Billing and workspace admin",
  },
  {
    id: "account_settings",
    href: "/dashboard/account",
    label: "Account settings",
    description: "Profile, sign-in, and logout",
  },
  {
    id: "team",
    href: "/dashboard/team",
    label: "Team",
    description: "Members, roles, and access",
  },
] as const;

const destinationById = new Map(DASHBOARD_DESTINATIONS.map((destination) => [destination.id, destination]));

export function getDashboardDestination(id: string): DashboardDestination | null {
  return destinationById.get(id) ?? null;
}

export function formatDashboardDestinationCatalog(): string {
  return DASHBOARD_DESTINATIONS.map((destination) =>
    `- ${destination.id}: ${destination.label} — ${destination.description} (${destination.href})`,
  ).join("\n");
}

export const NAVIGATE_DASHBOARD_TOOL = "navigate_dashboard";

export interface NavigateDashboardPayload {
  type: "navigate";
  href: string;
  label: string;
}

export function buildNavigateDashboardResult(destination: DashboardDestination): string {
  const payload: NavigateDashboardPayload = {
    type: "navigate",
    href: destination.href,
    label: destination.label,
  };
  return JSON.stringify(payload);
}

export function parseNavigateDashboardResult(result: string): NavigateDashboardPayload | null {
  try {
    const parsed = JSON.parse(result) as Partial<NavigateDashboardPayload>;
    if (parsed.type !== "navigate") return null;
    if (typeof parsed.href !== "string" || !parsed.href.startsWith("/dashboard")) return null;
    if (typeof parsed.label !== "string" || !parsed.label.trim()) return null;
    const allowed = DASHBOARD_DESTINATIONS.some((destination) => destination.href === parsed.href);
    return allowed ? { type: "navigate", href: parsed.href, label: parsed.label.trim() } : null;
  } catch {
    return null;
  }
}
