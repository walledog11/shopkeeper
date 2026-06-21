"use client"

import type { ReactNode } from "react"
import type { OrgSettings, OrgSettingsPatch, VoiceProposal } from "@/types"
import {
  AgentAutonomySection,
  AgentDefaultBehaviorSection,
  AgentGuardrailsSection,
  AgentIdentitySection,
  AgentResponseSection,
  AgentSampleRepliesSection,
  StickySaveBar,
} from "./agent-tab-sections"
import { useAgentTabState } from "./useAgentTabState"
import { TelegramApproveSection } from "./TelegramApproveSection"
import { WhenOnDutySection } from "./WhenOnDutySection"

interface Props {
  settings: OrgSettings
  rawSettings: OrgSettingsPatch
  version: string
  voiceProposal: VoiceProposal | null
}

interface ConfigureColumnProps {
  id: string
  children: ReactNode
}

function ConfigureColumn({ id, children }: ConfigureColumnProps) {
  return (
    <section id={id} className="scroll-mt-24 min-w-0">
      <div className="space-y-3">
        {children}
      </div>
    </section>
  )
}

export default function AgentTab(props: Props) {
  const controller = useAgentTabState(props)
  const { settingsState } = controller
  const agentName = settingsState.agentName

  return (
    <div className="min-w-0 space-y-6">
      <div className="sr-only">
        <h1>Configure {agentName}</h1>
        <p>Trust level, duty hours, voice, and operating limits.</p>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-9 lg:grid-cols-2 2xl:grid-cols-3">
        <ConfigureColumn id="trust">
          <AgentAutonomySection controller={controller} />
          <TelegramApproveSection />
        </ConfigureColumn>

        <ConfigureColumn id="duty">
          <WhenOnDutySection controller={controller} />
        </ConfigureColumn>

        <ConfigureColumn id="voice">
          <AgentIdentitySection controller={controller} />
          <AgentSampleRepliesSection controller={controller} />
          <AgentResponseSection controller={controller} />
        </ConfigureColumn>

        <ConfigureColumn id="limits">
          <AgentDefaultBehaviorSection controller={controller} />
          <AgentGuardrailsSection controller={controller} />
        </ConfigureColumn>
      </div>

      <StickySaveBar controller={controller} />
    </div>
  )
}
