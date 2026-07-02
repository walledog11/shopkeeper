"use client"

import AgentTab from "./AgentTab"
import type { OrgSettings, OrgSettingsPatch, VoiceProposal } from "@/types"

interface Props {
  settings: OrgSettings
  rawSettings: OrgSettingsPatch
  version: string
  voiceProposal: VoiceProposal | null
}

export default function ConfigurePageClient(props: Props) {
  return (
    <div className="relative flex size-full min-w-0 flex-col overflow-hidden bg-background">
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
