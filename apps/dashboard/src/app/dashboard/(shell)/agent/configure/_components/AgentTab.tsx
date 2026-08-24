"use client"

import { useOrganization } from "@clerk/nextjs"
import type { OrgSettings, OrgSettingsPatch, VoiceProposal } from "@/types"
import type { GatewayRuntimeFlags } from "@/lib/server/gateway-runtime-flags"
import {
  AgentAdvancedSection,
  AgentAutonomySection,
  AgentIdentitySection,
  MorningBriefingSection,
  ProactiveMonitoringSection,
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
  shopifyConnected: boolean
  runtimeFlags: GatewayRuntimeFlags["monitors"] | null
}

export default function AgentTab(props: Props) {
  const controller = useAgentTabState(props)
  // These settings decide how much the agent may do on its own and how much it
  // may refund, so saving them is admin-only server-side. Members can read the
  // page; the save bar tells them why they can't apply a change.
  const { membership } = useOrganization()
  const isAdmin = membership?.role === "org:admin"
  const { shopifyConnected } = props

  return (
    <div className="flex w-full flex-col gap-4">
      <AgentIdentitySection controller={controller} />
      <AgentAutonomySection controller={controller} />
      <WhenOnDutySection controller={controller} />
      {shopifyConnected ? <MorningBriefingSection controller={controller} /> : null}
      {shopifyConnected ? <ProactiveMonitoringSection controller={controller} runtimeFlags={props.runtimeFlags} /> : null}
      <AgentAdvancedSection controller={controller} />

      <StickySaveBar controller={controller} canSave={isAdmin} />
    </div>
  )
}
