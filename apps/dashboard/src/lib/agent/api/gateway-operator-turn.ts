import { getGatewayBaseUrl } from "@/lib/server/gateway-url";
import { fetchProviderWithDeadline } from "@/lib/server/provider-fetch";
import type { ActionEntry } from "@shopkeeper/agent/context";

// Just under the route's maxDuration so a hung gateway surfaces as a timeout
// here rather than the platform killing the function mid-request.
const OPERATOR_TURN_TIMEOUT_MS = 55_000;

export interface GatewayOperatorTurnPayload {
  threadId?: string;
  summary?: string;
  actionsPerformed?: ActionEntry[];
  awaitingApproval?: boolean;
  error?: string;
}

export interface GatewayOperatorTurnResponse {
  status: number;
  payload: GatewayOperatorTurnPayload | null;
}

// Runs one Concierge turn on the gateway's operator path — the same turn the
// merchant's phone gets, module tools included. The gateway resolves the thread
// and the pending queue from the Clerk user's org membership, so there is no
// session or chat id to pass. Throws when the gateway is unreachable or
// misconfigured; a reached gateway's status is returned for the route to map.
export async function postGatewayOperatorTurn(params: {
  organizationId: string;
  clerkUserId: string;
  instruction: string;
}): Promise<GatewayOperatorTurnResponse> {
  const base = getGatewayBaseUrl({ required: true });
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error("[agent/chat] INTERNAL_API_SECRET unset");
  }

  const res = await fetchProviderWithDeadline(`${base}/internal/operator/turn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify(params),
  }, {
    provider: "gateway",
    operation: "operator-turn",
    timeoutMs: OPERATOR_TURN_TIMEOUT_MS,
  });

  return {
    status: res.status,
    payload: await res.json().catch(() => null) as GatewayOperatorTurnPayload | null,
  };
}

// A decision the merchant made with a button rather than a sentence. It lands on
// the same approve/dismiss the control tools call, so the plan resolves across
// every device — but with no model call, which is the point of a button.
export async function postGatewayPlanDecision(params: {
  organizationId: string;
  clerkUserId: string;
  planId: string;
  decision: "approve" | "dismiss";
}): Promise<GatewayOperatorTurnResponse> {
  const base = getGatewayBaseUrl({ required: true });
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error("[agent/pending] INTERNAL_API_SECRET unset");
  }

  const res = await fetchProviderWithDeadline(`${base}/internal/operator/plan-decision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify(params),
  }, {
    provider: "gateway",
    operation: "operator-plan-decision",
    timeoutMs: OPERATOR_TURN_TIMEOUT_MS,
  });

  return {
    status: res.status,
    payload: await res.json().catch(() => null) as GatewayOperatorTurnPayload | null,
  };
}
