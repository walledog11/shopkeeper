"use client"

import { useIsWorkspaceAdmin } from "@/app/dashboard/_components/WorkspaceRoleContext"
import type { OrgSettings, OrgSettingsPatch } from "@/types"
import { AiUsageLimitSection } from "./AiUsageLimitSection"
import { MorningBriefingSection } from "./MorningBriefingSection"
import { PermissionsSection } from "./PermissionsSection"
import { StickySaveBar } from "./StickySaveBar"
import { BusinessNameSection, StoreTimezoneSection } from "./StoreSections"
import { WhenOnDutySection } from "./WhenOnDutySection"
import { useAgentTabState } from "./useAgentTabState"
import type { LlmSpendSnapshot } from "./llm-spend-presentation"

/** The settings pages that edit the workspace's agent settings. */
export type AgentSettingsPage = "approvals" | "briefing" | "billing"

export interface AgentSettingsFormProps {
  page: AgentSettingsPage
  settings: OrgSettings
  rawSettings: OrgSettingsPatch
  version: string
  orgName: string
  shopifyConnected: boolean
  phoneLinked: boolean
  /** Without a linked phone, the briefing goes by email (`NOTICE_EMAIL_FROM`). */
  noticeEmailEnabled: boolean
  llmSpend: LlmSpendSnapshot
}

export default function AgentSettingsForm(props: AgentSettingsFormProps) {
  const { page } = props
  const controller = useAgentTabState({ ...props, prefillTimezone: page === "briefing" })
  // These settings decide how much the agent may do on its own and how much it
  // may refund, so saving them is admin-only server-side. Members can read the
  // page; the save bar tells them why they can't apply a change.
  const isAdmin = useIsWorkspaceAdmin()

  return (
    <div className="flex w-full flex-col gap-4">
      {page === "approvals" ? <PermissionsSection controller={controller} /> : null}
      {page === "briefing" ? (
        <>
          <MorningBriefingSection
            controller={controller}
            phoneLinked={props.phoneLinked}
            noticeEmailEnabled={props.noticeEmailEnabled}
            shopifyConnected={props.shopifyConnected}
          />
          <WhenOnDutySection controller={controller} />
          <StoreTimezoneSection controller={controller} />
        </>
      ) : null}
      {page === "billing" ? (
        <>
          <BusinessNameSection controller={controller} />
          <AiUsageLimitSection controller={controller} llmSpend={props.llmSpend} />
        </>
      ) : null}

      <StickySaveBar controller={controller} canSave={isAdmin} />
    </div>
  )
}
