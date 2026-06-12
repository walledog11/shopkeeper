"use client";

import Link from "next/link";
import type { AutonomyTier } from "@shopkeeper/agent/settings";
import { agentConfigureHref } from "@/lib/agent/configure";
import { buildPanelTrustLine } from "@/lib/agent/panel-trust";

interface Props {
  tier: AutonomyTier;
}

export default function AgentPanelTrustStrip({ tier }: Props) {
  const { label, detail } = buildPanelTrustLine(tier);

  return (
    <div className="shrink-0 border-b border-border bg-muted/20 px-4 py-1.5">
      <Link
        href={agentConfigureHref("autonomy")}
        className="block min-w-0 text-xs leading-snug text-muted-foreground transition-colors hover:text-foreground"
        aria-label={`Trust level: ${label}. ${detail} Open agent configure.`}
      >
        <span className="font-medium text-foreground/75">Trust level: {label}</span>
        <span className="text-muted-foreground"> · {detail}</span>
      </Link>
    </div>
  );
}
