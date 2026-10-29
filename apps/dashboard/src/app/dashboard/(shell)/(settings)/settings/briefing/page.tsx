import ImessageCard from "@/components/integrations/ImessageCard"
import { INTEGRATION_DEFINITIONS, type PersonalDeviceIntegrationDefinition } from "@/lib/integrations/catalog"
import { normalizeImessageLineHandle } from "@/lib/integrations/imessage-visibility"
import AgentSettingsForm from "../_components/agent/AgentSettingsForm"
import { loadAgentSettingsForm } from "../_components/agent/load-agent-settings"

const IMESSAGE_DEFINITION = INTEGRATION_DEFINITIONS.find(
  (definition): definition is PersonalDeviceIntegrationDefinition =>
    definition.kind === "personal-device" && definition.id === "imessage",
)

export default async function PhoneAndBriefingSettingsPage() {
  const form = await loadAgentSettingsForm("briefing")
  const handle = normalizeImessageLineHandle(process.env.IMESSAGE_LINE_HANDLE)

  return (
    <>
      {IMESSAGE_DEFINITION ? (
        <div className="max-w-md">
          <ImessageCard config={IMESSAGE_DEFINITION} handle={handle} />
        </div>
      ) : null}
      <AgentSettingsForm {...form} />
    </>
  )
}
