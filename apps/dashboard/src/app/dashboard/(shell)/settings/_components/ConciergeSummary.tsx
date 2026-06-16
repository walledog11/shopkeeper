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
    <div className="relative [&>p]:relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-10 size-52 rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.18)_0%,transparent_65%)]"
      />

      <div className="relative flex items-center gap-2">
        <span className="inline-flex size-5 items-center justify-center rounded bg-amber-400 text-black">
          <Sparkles className="size-3" />
        </span>
        <span className="text-[10.5px] font-bold tracking-[0.07em] text-amber-400 font-mono">
          {settings.agentName.toUpperCase()}&apos;S SETUP FOR {orgName.toUpperCase()}
        </span>
      </div>

      <p className="mt-2.5 text-[14px] leading-relaxed text-foreground/80">
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
  "inline-flex items-baseline rounded border border-foreground/[0.12] bg-foreground/[0.06] px-1.5 py-px align-baseline text-[13.5px] font-medium text-white transition-colors hover:bg-foreground/[0.10]"

function Pill({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={PILL_CLASS}>
      {children}
    </Link>
  )
}
