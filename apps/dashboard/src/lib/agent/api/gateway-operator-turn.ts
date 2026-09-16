import { getGatewayBaseUrl } from "@/lib/server/gateway-url";
import { fetchProviderWithDeadline } from "@/lib/server/provider-fetch";
import type { ActionEntry } from "@shopkeeper/agent/context";

// Just under the route's maxDuration so a hung gateway surfaces as a timeout
// here rather than the platform killing the function mid-request.
const OPERATOR_TURN_TIMEOUT_MS = 55_000;

interface GatewayOperatorTurnPayload {
  threadId?: string;
  summary?: string;
  actionsPerformed?: ActionEntry[];
  awaitingApproval?: boolean;
  error?: string;
}

interface GatewayOperatorTurnResponse {
  status: number;
  payload: GatewayOperatorTurnPayload | null;
}

type DurableAgentTaskStatus =
  | "accepted" | "attached" | "queued" | "running" | "waiting_input"
  | "waiting_approval" | "reconciling" | "completed" | "failed" | "cancelled";

export interface GatewayAgentRequestPayload {
  requestId: string;
  instruction: string;
  taskId: string | null;
  status: DurableAgentTaskStatus;
  taskRevision: number | null;
  acceptedAt: string;
  updatedAt: string;
  statusUrl?: string;
  deduplicated?: boolean;
  response: {
    summary: string;
    actionsPerformed: ActionEntry[];
    awaitingApproval: boolean;
  } | null;
  delivery: { status: "pending" | "available"; messageId: string | null };
  failureCode: string | null;
}

function gatewayAuth() {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) throw new Error("[agent/chat] INTERNAL_API_SECRET unset");
  return { "Content-Type": "application/json", "x-internal-secret": secret };
}

export async function postGatewayAgentRequest(params: {
  organizationId: string;
  clerkUserId: string;
  clientRequestId: string;
  instruction: string;
}): Promise<{ status: number; payload: GatewayAgentRequestPayload | (Record<string, unknown> & { error?: string }) | null }> {
  const base = getGatewayBaseUrl({ required: true });
  const res = await fetchProviderWithDeadline(`${base}/internal/operator/requests`, {
    method: "POST",
    headers: gatewayAuth(),
    body: JSON.stringify(params),
  }, { provider: "gateway", operation: "operator-request-submit", timeoutMs: 10_000 });
  return { status: res.status, payload: await res.json().catch(() => null) };
}

export async function getGatewayAgentRequest(params: {
  organizationId: string;
  clerkUserId: string;
  requestId: string;
}): Promise<{ status: number; payload: GatewayAgentRequestPayload | (Record<string, unknown> & { error?: string }) | null }> {
  const base = getGatewayBaseUrl({ required: true });
  const query = new URLSearchParams({ organizationId: params.organizationId, clerkUserId: params.clerkUserId });
  const res = await fetchProviderWithDeadline(`${base}/internal/operator/requests/${encodeURIComponent(params.requestId)}?${query}`, {
    headers: gatewayAuth(),
  }, { provider: "gateway", operation: "operator-request-status", timeoutMs: 10_000 });
  return { status: res.status, payload: await res.json().catch(() => null) };
}

export async function listGatewayAgentRequests(params: {
  organizationId: string;
  clerkUserId: string;
}): Promise<{ status: number; payload: { requests?: GatewayAgentRequestPayload[]; error?: string } | null }> {
  const base = getGatewayBaseUrl({ required: true });
  const query = new URLSearchParams(params);
  const res = await fetchProviderWithDeadline(`${base}/internal/operator/requests?${query}`, {
    headers: gatewayAuth(),
  }, { provider: "gateway", operation: "operator-request-list", timeoutMs: 10_000 });
  return { status: res.status, payload: await res.json().catch(() => null) };
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

  const res = await fetchProviderWithDeadline(`${base}/internal/operator/plan-decision`, {
    method: "POST",
    headers: {
      ...gatewayAuth(),
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
