import type { Metadata } from "next"
import { resolveAgentSettings } from "@shopkeeper/agent/settings"
import { getOrCreateOrg } from "@/lib/server/org"
import VoicePageClient from "./_components/VoicePageClient"

export const metadata: Metadata = { title: "Voice" }

export default async function VoicePage() {
  const org = await getOrCreateOrg()
  const settings = resolveAgentSettings(org.settings)
  return <VoicePageClient initialTraits={settings.voiceTraits ?? {}} initialNotes={settings.brandVoice} />
}
