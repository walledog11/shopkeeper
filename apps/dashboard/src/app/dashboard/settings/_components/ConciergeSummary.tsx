"use client"

import Link from "next/link"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/ui/cn"
import type { OrgSettings } from "@/types"
import type { SettingsTab } from "./SettingsPageClient"

interface Props {
  orgName: string
  settings: OrgSettings
  onJump: (tab: SettingsTab) => void
}

export default function ConciergeSummary({ orgName, settings, onJump }: Props) {
  const agentName = settings.agentName?.trim() || "Clerk"
  const lang = settings.replyLanguage === 'auto' ? "the customer's language" : settings.replyLanguage
  const jumpAgent = () => onJump('agent')

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-b from-amber-400/[0.08] via-white/[0.02] to-transparent px-5 py-4 mb-6 [&>p]:relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-10 size-52 rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.18)_0%,transparent_65%)]"
      />

      <div className="relative flex items-center gap-2">
        <span className="inline-flex size-5 items-center justify-center rounded bg-amber-400 text-black">
          <Sparkles className="size-3" />
        </span>
        <span className="text-[10.5px] font-bold tracking-[0.07em] text-amber-400 font-mono">
          HERE&apos;S HOW {agentName.toUpperCase()} IS SET UP
        </span>
      </div>

      <p className="mt-2.5 max-w-2xl text-[14px] leading-relaxed text-white/80">
        For <span className="text-white font-medium">{orgName}</span>, {agentName} is set to{" "}
        <Pill onClick={jumpAgent}>
          {settings.autoPlanOnOpen ? "draft a plan the moment a ticket opens" : "wait for you to ask before planning"}
        </Pill> and{" "}
        <Pill onClick={jumpAgent}>
          {settings.requireApprovalForActions ? "pause for your approval before acting" : "act without waiting for approval"}
        </Pill>. It can handle{" "}
        <Pill onClick={jumpAgent}>
          {settings.maxRefundAmount == null ? "any refund amount" : `refunds up to $${settings.maxRefundAmount}`}
        </Pill> and replies in <Pill onClick={jumpAgent}>{lang}</Pill>.{" "}
        Channels live in <Pill href="/dashboard/integrations">Integrations</Pill>; plan and invoices in{" "}
        <Pill onClick={() => onJump('billing')}>billing</Pill>.
      </p>
    </div>
  )
}

const PILL_CLASS = "inline-flex items-baseline rounded border border-white/[0.12] bg-white/[0.06] px-1.5 py-px align-baseline text-[13.5px] font-medium text-white transition-colors hover:bg-white/[0.10]"

function Pill(props: { children: React.ReactNode } & ({ onClick: () => void; href?: never } | { href: string; onClick?: never })) {
  if ('href' in props && props.href) {
    return <Link href={props.href} className={PILL_CLASS}>{props.children}</Link>
  }
  return <button type="button" onClick={props.onClick} className={PILL_CLASS}>{props.children}</button>
}
