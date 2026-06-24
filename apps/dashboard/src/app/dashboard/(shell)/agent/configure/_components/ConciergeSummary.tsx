"use client"

import Link from "next/link"
import { Sparkles } from "lucide-react"
import { formatRefundCapSummary } from "@/lib/agent/autonomy-tiers"
import { agentConfigureHref } from "@/lib/agent/configure"
import type { OrgSettings } from "@/types"

interface Props {
  orgName: string
  settings: OrgSettings
}

export default function ConciergeSummary({ orgName, settings }: Props) {
  const lang = settings.replyLanguage === "auto" ? "the customer's language" : settings.replyLanguage
  const refundCap = formatRefundCapSummary(settings)

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300">
          <Sparkles className="size-3" />
        </span>
        <span className="truncate text-[10.5px] font-bold uppercase tracking-[0.07em] text-amber-300">
          {settings.agentName.toUpperCase()}&apos;S SETUP FOR {orgName.toUpperCase()}
        </span>
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-foreground/75">
        I&apos;m set to{" "}
        <Pill href={agentConfigureHref("autonomy")}>
          {settings.autoPlanOnOpen ? "draft a plan the moment a ticket opens" : "wait for you to ask before planning"}
        </Pill> and{" "}
        <Pill href={agentConfigureHref("autonomy")}>
          {settings.requireApprovalForActions
            ? "pause for your approval before acting"
            : "send simple replies on my own (refunds and cancellations still need your OK)"}
        </Pill>. I can handle{" "}
        <Pill href={agentConfigureHref("autonomy")}>{refundCap}</Pill> and reply in{" "}
        <Pill href={agentConfigureHref("autonomy")}>{lang}</Pill>. Customer channels live in{" "}
        <Pill href="/dashboard/integrations">Integrations</Pill>; plan and invoices in{" "}
        <Pill href="/dashboard/settings?tab=billing">billing</Pill>.
      </p>
    </div>
  )
}

const PILL_CLASS =
  "inline-flex items-baseline rounded-md border border-foreground/[0.10] bg-foreground/[0.05] px-1.5 py-px align-baseline text-[13px] font-medium text-foreground/90 transition-colors hover:bg-foreground/[0.10] hover:text-white"

function Pill({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={PILL_CLASS}>
      {children}
    </Link>
  )
}
