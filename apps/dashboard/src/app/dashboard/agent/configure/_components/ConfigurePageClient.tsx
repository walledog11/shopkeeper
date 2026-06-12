"use client"

import AgentTab from "@/app/dashboard/settings/_components/AgentTab"
import ConciergeSummary from "@/app/dashboard/settings/_components/ConciergeSummary"
import type { OrgSettings, OrgSettingsPatch, VoiceProposal } from "@/types"

interface Props {
  orgName: string
  settings: OrgSettings
  rawSettings: OrgSettingsPatch
  version: string
  voiceProposal: VoiceProposal | null
}

export default function ConfigurePageClient(props: Props) {
  return (
    <div className="flex-1 overflow-y-auto min-w-0">
      <div className="sticky top-0 z-20 border-b border-white/[0.06] bg-neutral-950/95 px-4 py-4 backdrop-blur-md supports-[backdrop-filter]:bg-neutral-950/88 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-b from-amber-400/[0.08] via-white/[0.02] to-transparent px-5 py-4 sm:px-6">
          <ConciergeSummary orgName={props.orgName} settings={props.settings} />
        </section>
      </div>

      <div className="w-full px-4 py-6 pb-20 sm:px-6 lg:px-8">
        <AgentTab
          settings={props.settings}
          rawSettings={props.rawSettings}
          version={props.version}
          voiceProposal={props.voiceProposal}
        />
      </div>
    </div>
  )
}
