"use client"

import useSWR from "swr"
import type { OrgSettings, OrgSettingsPatch, VoiceProposal } from "@/types"
import { fetcher } from "@/lib/api/fetcher"
import {
  AgentAdvancedSection,
  AgentAutonomySection,
  AgentDefaultBehaviorSection,
  AgentIdentitySection,
  StickySaveBar,
  WhenOnDutySection,
} from "./agent-tab-sections"
import { useAgentTabState } from "./useAgentTabState"

interface Props {
  settings: OrgSettings
  rawSettings: OrgSettingsPatch
  version: string
  orgName: string
  voiceProposal: VoiceProposal | null
}

interface IntegrationRow {
  platform: string
}

export default function AgentTab(props: Props) {
  const controller = useAgentTabState(props)
  const { settingsState } = controller
  const agentName = settingsState.agentName
  const { data: integrations } = useSWR<IntegrationRow[]>("/api/integrations", fetcher)
  const emailConnected = integrations?.some(row => row.platform === "email") ?? false

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-20">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Agent settings</h1>
        <p className="mt-0.5 text-sm text-faint">
          How {agentName} represents your store, how much it can do alone, and when it is on duty.
        </p>
      </div>

      <div className="space-y-6">
        <AgentIdentitySection controller={controller} />
        <AgentAutonomySection controller={controller} />
        <AgentDefaultBehaviorSection controller={controller} />
        <WhenOnDutySection controller={controller} emailConnected={emailConnected} />
        <AgentAdvancedSection controller={controller} />
      </div>

      <StickySaveBar controller={controller} />
    </div>
  )
}
