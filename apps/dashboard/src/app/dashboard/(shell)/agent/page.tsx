import { redirect } from "next/navigation";
import { buildAgentPanelHref } from "@/lib/agent/panel";

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;
  redirect(buildAgentPanelHref({ session: session ?? null }));
}
