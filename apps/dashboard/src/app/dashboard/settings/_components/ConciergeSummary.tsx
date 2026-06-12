"use client"

import Link from "next/link"
import { Sparkles } from "lucide-react"
import { formatRefundCapSummary } from "@/lib/agent/autonomy-tiers"
import type { OrgSettings } from "@/types"
import type { SettingsTab } from "./SettingsPageClient"

interface Props {
  orgName: string
  settings: OrgSettings
  onJump: (tab: SettingsTab) => void
}

export default function ConciergeSummary({ orgName, settings, onJump }: Props) {
  const lang = settings.replyLanguage === "auto" ? "the customer's language" : settings.replyLanguage
  const jumpAgent = () => onJump("agent")
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

      <p className="mt-2.5 text-[14px] leading-relaxed text-white/80">
        I&apos;m set to{" "}
        <Pill onClick={jumpAgent}>
          {settings.autoPlanOnOpen ? "draft a plan the moment a ticket opens" : "wait for you to ask before planning"}
        </Pill> and{" "}
        <Pill onClick={jumpAgent}>
          {settings.requireApprovalForActions
            ? "pause for your approval before acting"
            : "send simple replies on my own (refunds and cancellations still need your OK)"}
        </Pill>. I can handle{" "}
        <Pill onClick={jumpAgent}>{refundCap}</Pill> and reply in <Pill onClick={jumpAgent}>{lang}</Pill>.{" "}
        Customer channels live in <Pill href="/dashboard/integrations">Integrations</Pill>; plan and invoices in{" "}
        <Pill onClick={() => onJump("billing")}>billing</Pill>.
      </p>
    </div>
  )
}

const PILL_CLASS =
  "inline-flex items-baseline rounded border border-white/[0.12] bg-white/[0.06] px-1.5 py-px align-baseline text-[13.5px] font-medium text-white transition-colors hover:bg-white/[0.10]"

function Pill(
  props: { children: React.ReactNode } & ({ onClick: () => void; href?: never } | { href: string; onClick?: never }),
) {
  if ("href" in props && props.href) {
    return (
      <Link href={props.href} className={PILL_CLASS}>
        {props.children}
      </Link>
    )
  }
  return (
    <button type="button" onClick={props.onClick} className={PILL_CLASS}>
      {props.children}
    </button>
  )
}
