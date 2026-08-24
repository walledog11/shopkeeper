export interface DashboardDestination {
  id: string;
  href: string;
  label: string;
  description: string;
  keywords: readonly string[];
}

export const DASHBOARD_DESTINATIONS: readonly DashboardDestination[] = [
  {
    id: "home",
    href: "/dashboard",
    label: "Home",
    description: "Dashboard home and daily briefing",
    keywords: ["home", "today", "briefing", "dashboard"],
  },
  {
    id: "inbox",
    href: "/dashboard/tickets",
    label: "Inbox",
    description: "Support tickets and customer conversations",
    keywords: ["inbox", "tickets", "messages", "support"],
  },
  {
    id: "integrations",
    href: "/dashboard/integrations",
    label: "Integrations",
    description: "Connect email, Instagram, Telegram, and other channels",
    keywords: [
      "integrations",
      "channels",
      "email",
      "gmail",
      "instagram",
      "imessage",
      "telegram",
      "connect",
      "add email",
      "forwarding",
    ],
  },
  {
    id: "agent_settings",
    href: "/dashboard/agent/configure",
    label: "Agent settings",
    description: "Store identity, trust level, brand voice, and autonomy",
    keywords: [
      "agent settings",
      "trust level",
      "trust",
      "autonomy",
      "voice",
      "brand",
      "configure agent",
    ],
  },
  {
    id: "memory",
    href: "/dashboard/kb",
    label: "Memory",
    description: "Facts, policies, and learned answers",
    keywords: ["memory", "knowledge base", "kb", "policies", "facts", "notes"],
  },
  {
    id: "review",
    href: "/dashboard/review",
    label: "Review",
    description: "Approve and refine agent responses",
    keywords: ["review", "approvals", "history", "audit"],
  },
  {
    id: "orders",
    href: "/dashboard/orders",
    label: "Shop",
    description: "Orders that need a look",
    keywords: ["orders", "shop", "shopify"],
  },
  {
    id: "workspace_settings",
    href: "/dashboard/settings",
    label: "Organization settings",
    description: "Billing and organization admin",
    keywords: ["organization settings", "workspace settings", "billing", "admin", "subscription", "plan"],
  },
  {
    id: "team",
    href: "/dashboard/team",
    label: "Team",
    description: "Members, roles, and access",
    keywords: ["team", "members", "roles", "invite"],
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
