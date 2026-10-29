"use client"

import { useOrganization } from "@clerk/nextjs"
import type { OrgSettings, OrgSettingsPatch, VoiceProposal } from "@/types"
import type { MerchantPreferenceRecord } from "@shopkeeper/db/merchant-preferences"
import { AgentAutonomySection } from "./AgentAutonomySection"
import { AiUsageLimitSection, ApprovalLimitsSection } from "./ApprovalLimitsSection"
import { MerchantPreferencesSection } from "./MerchantPreferencesSection"
import { MorningBriefingSection } from "./MorningBriefingSection"
import { StickySaveBar } from "./StickySaveBar"
import { StoreGeneralSection, StoreProfileSection } from "./StoreSections"
import { WhenOnDutySection } from "./WhenOnDutySection"
import { useAgentTabState } from "./useAgentTabState"
import { useMerchantPreferencesState } from "./useMerchantPreferencesState"
import type { LlmSpendSnapshot } from "./llm-spend-presentation"

/** The settings pages that edit the workspace's agent settings. */
export type AgentSettingsPage = "general" | "store-profile" | "approvals" | "hours" | "briefing" | "usage"

export interface AgentSettingsFormProps {
  page: AgentSettingsPage
  settings: OrgSettings
  rawSettings: OrgSettingsPatch
  version: string
  orgName: string
  voiceProposal: VoiceProposal | null
  shopifyConnected: boolean
  phoneLinked: boolean
  merchantPreferences: {
    active: MerchantPreferenceRecord[]
    proposed: MerchantPreferenceRecord[]
  }
  llmSpend: LlmSpendSnapshot
}

export default function AgentSettingsForm(props: AgentSettingsFormProps) {
  const { page } = props
  const controller = useAgentTabState({ ...props, prefillTimezone: page === "general" })
  const preferencesController = useMerchantPreferencesState(props.merchantPreferences)
  // These settings decide how much the agent may do on its own and how much it
  // may refund, so saving them is admin-only server-side. Members can read the
  // page; the save bar tells them why they can't apply a change.
  const { membership } = useOrganization()
  const isAdmin = membership?.role === "org:admin"

  return (
    <div className="flex w-full flex-col gap-4">
      {page === "general" ? <StoreGeneralSection controller={controller} /> : null}
      {page === "store-profile" ? (
        <>
          <StoreProfileSection controller={controller} />
          <MerchantPreferencesSection controller={preferencesController} canEdit={isAdmin} />
        </>
      ) : null}
      {page === "approvals" ? (
        <>
          <AgentAutonomySection controller={controller} />
          <ApprovalLimitsSection controller={controller} />
        </>
      ) : null}
      {page === "hours" ? <WhenOnDutySection controller={controller} /> : null}
      {page === "briefing" ? (
        <MorningBriefingSection
          controller={controller}
          phoneLinked={props.phoneLinked}
          shopifyConnected={props.shopifyConnected}
        />
      ) : null}
      {page === "usage" ? <AiUsageLimitSection controller={controller} llmSpend={props.llmSpend} /> : null}

      <StickySaveBar controller={controller} canSave={isAdmin} />
    </div>
  )
}
