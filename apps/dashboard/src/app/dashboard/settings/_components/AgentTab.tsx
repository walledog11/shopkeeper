"use client"

import type { OrgSettings, OrgSettingsPatch, VoiceProposal } from "@/types"
import {
  AgentAutonomySection,
  AgentDefaultBehaviorSection,
  AgentGuardrailsSection,
  AgentIdentitySection,
  AgentResponseSection,
  AgentSampleRepliesSection,
  BusinessHoursSection,
  SpamFilterSection,
  StickySaveBar,
  WhatsAppDigestSection,
} from "./agent-tab-sections"
import { useAgentTabState } from "./useAgentTabState"

interface Props {
  settings: OrgSettings
  rawSettings: OrgSettingsPatch
  version: string
  voiceProposal: VoiceProposal | null
}

export default function AgentTab(props: Props) {
  const controller = useAgentTabState(props)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white/80">Agent</h1>
        <p className="text-sm text-white/35 mt-0.5">Configure how your AI agent behaves, what it can do, and how it communicates.</p>
      </div>

      <AgentAutonomySection controller={controller} />
      <AgentIdentitySection controller={controller} />
      <AgentSampleRepliesSection controller={controller} />
      <AgentDefaultBehaviorSection controller={controller} />
      <AgentGuardrailsSection controller={controller} />
      <AgentResponseSection controller={controller} />
      <WhatsAppDigestSection controller={controller} />
      <BusinessHoursSection controller={controller} />
      <SpamFilterSection controller={controller} />
      <StickySaveBar controller={controller} />
    </div>
  )
}
