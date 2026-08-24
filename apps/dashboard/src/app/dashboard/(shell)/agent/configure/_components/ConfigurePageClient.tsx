"use client"

import AgentTab from "./AgentTab"
import type { OrgSettings, OrgSettingsPatch, VoiceProposal } from "@/types"
import type { GatewayRuntimeFlags } from "@/lib/server/gateway-runtime-flags"
import { dashboardPageShellClassName } from "@/app/dashboard/_components/sidebar/sidebar-helpers"
import { cn } from "@/lib/ui/cn"

interface Props {
  settings: OrgSettings
  rawSettings: OrgSettingsPatch
  version: string
  orgName: string
  voiceProposal: VoiceProposal | null
  shopifyConnected: boolean
  runtimeFlags: GatewayRuntimeFlags["monitors"] | null
}

export default function ConfigurePageClient(props: Props) {
  return (
    <div className="relative flex size-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <div className={cn(dashboardPageShellClassName(), "gap-4 pb-20")}>
          <AgentTab
            settings={props.settings}
            rawSettings={props.rawSettings}
            version={props.version}
            orgName={props.orgName}
            voiceProposal={props.voiceProposal}
            shopifyConnected={props.shopifyConnected}
            runtimeFlags={props.runtimeFlags}
          />
        </div>
      </div>
    </div>
  )
}
