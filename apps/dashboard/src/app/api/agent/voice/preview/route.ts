import { NextResponse } from "next/server";
import { generateText, pickModel } from "@shopkeeper/agent/ai";
import { buildVoicePreviewPrompt } from "@shopkeeper/agent/prompt";
import { resolveAgentSettings } from "@shopkeeper/agent/settings";
import { withOrgRoute } from "@/lib/api/route";
import { readRequiredJsonObject } from "@/lib/api/body";
import { ServiceUnavailableError } from "@/lib/api/errors";
import { parseVoicePreviewBody } from "@/lib/agent/api/validation";

export const maxDuration = 60;

// The reply the agent would send to one sample customer in a voice the merchant
// is trying out. Same model and same voice section as a real draft; a text-only
// call, so nothing is sent, stored or changed.
export const POST = withOrgRoute(
  {
    context: "Voice preview POST",
    errorMessage: "Couldn't draft a sample reply. Try again.",
    requireBillingWriteAllowed: true,
    rateLimit: { key: "agent:voice-preview", limit: 40, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { brief, scenario } = parseVoicePreviewBody(await readRequiredJsonObject(request));
    const settings = resolveAgentSettings(org.settings);
    const reply = await generateText(
      buildVoicePreviewPrompt(org.name, { ...settings, brandVoice: brief }),
      [{
        role: "user",
        content: JSON.stringify({ customerName: scenario.customerName, message: scenario.message, facts: scenario.facts }),
      }],
      { orgId: org.id, settings, maxTokens: 600, model: pickModel("agent_run") },
    );
    if (!reply.trim()) throw new ServiceUnavailableError("No reply came back. Try again.");
    return NextResponse.json({ reply: reply.trim() });
  },
);
