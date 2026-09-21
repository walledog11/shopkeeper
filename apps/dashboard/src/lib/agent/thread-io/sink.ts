import { composeThreadSink } from "@shopkeeper/agent/thread-io";
import { getGatewayBaseUrl } from "@/lib/server/gateway-url";
import { fetchProviderWithDeadline } from "@/lib/server/provider-fetch";
import logger from "@/lib/server/logger";
import { sendEmail, sendReply } from "./send";

async function notifyGatewayOfEscalation(args: {
  organizationId: string;
  threadId: string;
  reason: string;
}): Promise<void> {
  const base = getGatewayBaseUrl();
  if (!base) {
    logger.warn({ threadId: args.threadId }, "[escalateToHuman] No gateway base URL — skipping operator push");
    return;
  }
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    logger.warn({ threadId: args.threadId }, "[escalateToHuman] INTERNAL_API_SECRET unset — skipping operator push");
    return;
  }
  try {
    const res = await fetchProviderWithDeadline(`${base}/internal/operator/escalate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify(args),
    }, {
      provider: "gateway",
      operation: "operator escalation notification",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, threadId: args.threadId, body: body.slice(0, 300) },
        "[escalateToHuman] Gateway escalation push failed",
      );
    }
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, threadId: args.threadId },
      "[escalateToHuman] Gateway escalation push errored",
    );
  }
}

const dashboardThreadSink = composeThreadSink({
  sendReply,
  sendEmail,
  onEscalated: (ctx, reason) => notifyGatewayOfEscalation({
    organizationId: ctx.orgId,
    threadId: ctx.threadId,
    reason,
  }),
});

export const addInternalNote = dashboardThreadSink.addInternalNote;
export const updateThreadStatus = dashboardThreadSink.updateThreadStatus;
export const updateThreadTag = dashboardThreadSink.updateThreadTag;
export const escalateToHuman = dashboardThreadSink.escalateToHuman;
export const askOperator = dashboardThreadSink.askOperator;

export { sendEmail, sendReply } from "./send";
