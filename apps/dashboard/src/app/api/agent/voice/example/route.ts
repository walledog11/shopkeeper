import { NextResponse } from "next/server";
import { db, isMeaningfulVoiceEdit } from "@shopkeeper/db";
import { withOrgRoute } from "@/lib/api/route";
import { readRequiredJsonObject } from "@/lib/api/body";
import { parseVoiceExampleBody } from "@/lib/agent/api/validation";

// A reply the merchant wrote on the Voice page in place of the agent's sample.
// It is stored like an edit to a real draft, so the voice learning that reads
// those edits learns from it too.
export const POST = withOrgRoute(
  {
    context: "Voice example POST",
    errorMessage: "Couldn't save your reply. Try again.",
    requireBillingWriteAllowed: true,
    rateLimit: { key: "agent:voice-example", limit: 20, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { draft, reply } = parseVoiceExampleBody(await readRequiredJsonObject(request));
    if (!isMeaningfulVoiceEdit(draft, reply)) return NextResponse.json({ saved: false });
    await db.voiceEdit.create({
      data: { organizationId: org.id, aiDraft: draft, finalText: reply, tag: "practice" },
    });
    return NextResponse.json({ saved: true }, { status: 201 });
  },
);
