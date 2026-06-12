export const OPEN_AGENT_SEARCH_PARAM = "openAgent";
export const THREAD_SEARCH_PARAM = "thread";

export type AgentPanelOpenSource = "home" | "tickets" | "review" | "command";

export interface AgentPanelOpenContext {
  source: AgentPanelOpenSource;
  threadId?: string;
  customerName?: string;
}

export function buildAgentPanelHref(options?: {
  session?: string | null;
  pathname?: string;
  thread?: string | null;
}): string {
  const pathname = options?.pathname ?? "/dashboard";
  const params = new URLSearchParams();
  params.set(OPEN_AGENT_SEARCH_PARAM, "1");
  if (options?.session) params.set("session", options.session);
  if (options?.thread) params.set(THREAD_SEARCH_PARAM, options.thread);
  return `${pathname}?${params.toString()}`;
}

export function inferAgentPanelSource(pathname: string, searchParams: URLSearchParams): AgentPanelOpenSource {
  if (pathname.startsWith("/dashboard/tickets")) return "tickets";
  if (searchParams.get("session")) return "review";
  if (pathname === "/dashboard" || pathname === "/dashboard/") return "home";
  return "command";
}
