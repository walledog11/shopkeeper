"use client"

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
import { SettingsDisclosure } from "./shared"
import { useAgentTabState } from "./useAgentTabState"
import { TelegramApproveSection } from "./TelegramApproveSection"
import { WhenOnDutySection } from "./WhenOnDutySection"

interface Props {
  settings: OrgSettings
  rawSettings: OrgSettingsPatch
  version: string
  voiceProposal: VoiceProposal | null
}

export default function AgentTab(props: Props) {
  const controller = useAgentTabState(props)
  const agentName = controller.settingsState.agentName

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white/80">Configure</h1>
        <p className="text-sm text-white/35 mt-0.5 max-w-prose">
          How much {agentName} can do alone, and when {agentName} is on duty. Everything else is optional.
        </p>
      </div>

      <AgentAutonomySection controller={controller} />
      <TelegramApproveSection />
      <WhenOnDutySection controller={controller} />

      <SettingsDisclosure
        title="Voice & style"
        description="Name, brand voice, sample replies, and reply language."
      >
        <AgentIdentitySection controller={controller} />
        <AgentSampleRepliesSection controller={controller} />
        <AgentResponseSection controller={controller} />
      </SettingsDisclosure>

      <SettingsDisclosure
        title="Behavior & limits"
        description="Auto-planning, default instructions, and hard spending caps."
      >
        <AgentDefaultBehaviorSection controller={controller} />
        <AgentGuardrailsSection controller={controller} />
      </SettingsDisclosure>

      <StickySaveBar controller={controller} />
    </div>
  )
}
