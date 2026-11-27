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
    label: "Channels",
    description: "Connect email, Instagram, website chat, and Shopify",
  },
  {
    id: "memory",
    href: "/dashboard/kb",
    label: "Memory",
    description: "Store profile, brand voice, preferences, notes, and learned answers",
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
    id: "voice",
    href: "/dashboard/voice",
    label: "How it sounds",
    description: "Practice replies that teach Shopkeeper how you sound",
  },
  {
    id: "approvals",
    href: "/dashboard/settings/approvals",
    label: "What it can do on its own",
    description: "Whether routine replies go out on their own, the refund limit, damage photos and cancellations",
  },
  {
    id: "briefing",
    href: "/dashboard/settings/briefing",
    label: "When and where it reaches you",
    description: "Link an iPhone, the briefing, business hours, the away message and the timezone",
  },
  {
    id: "billing",
    href: "/dashboard/settings/billing",
    label: "Account & billing",
    description: "Business name, plan, payment, invoices, and the daily AI limit",
  },
  {
    id: "team",
    href: "/dashboard/team",
    label: "Team",
    description: "Members, roles, and access",
  },
  {
    id: "data_privacy",
    href: "/dashboard/settings/data",
    label: "Your data",
    description: "Exports, archiving, and deleting the workspace",
  },
  {
    id: "account_settings",
    href: "/dashboard/account",
    label: "Your login",
    description: "Profile, sign-in, and logout",
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
