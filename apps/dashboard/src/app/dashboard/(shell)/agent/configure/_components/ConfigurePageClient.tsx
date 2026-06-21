"use client"

import AgentTab from "../../../settings/_components/AgentTab"
import ConciergeSummary from "../../../settings/_components/ConciergeSummary"
import type { OrgSettings, OrgSettingsPatch, VoiceProposal } from "@/types"

interface Props {
  orgName: string
  settings: OrgSettings
  rawSettings: OrgSettingsPatch
  version: string
  voiceProposal: VoiceProposal | null
}

const GLASS_SHELL_CLASS =
  "space-y-2 rounded-[22px] border border-foreground/[0.08] bg-card/60 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_50px_rgba(43,33,24,0.13)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-card/45"

const GLASS_CONTROL_CLASS =
  "border border-foreground/[0.08] bg-background/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-background/28"

export default function ConfigurePageClient(props: Props) {
  return (
    <div className="relative flex size-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="relative z-20 shrink-0 px-3 pb-3 pt-3">
        <div className={GLASS_SHELL_CLASS}>
          <section className={`min-w-0 rounded-[18px] px-4 py-3.5 sm:px-5 ${GLASS_CONTROL_CLASS}`}>
            <ConciergeSummary orgName={props.orgName} settings={props.settings} />
          </section>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-6 sm:px-6">
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
