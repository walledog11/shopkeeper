import { randomUUID } from "node:crypto";
import { createMessage } from "@shopkeeper/db";
import { resolveAgentSettings } from "./settings.js";
import { serializeAgentTurn } from "./turns.js";
import { ConflictError } from "./errors.js";
import type { LockProvider } from "./lock/index.js";
import type { AgentContext, AgentActionMode, AgentResult } from "./agent-context.js";
import type { AgentActionApproval } from "./agent-actions.js";
import type { AgentToolDefinition } from "./tools/registry/index.js";
import type { OrgSettings, RawToolCall } from "./types.js";

// Options executeAgentTurn forwards to the injected runAgent. The host's runAgent
// wrapper resolves `failureRoute` into its ops-alert recorder and builds the
// failure-counter client; the package never touches that infra.
export interface ExecuteTurnRunOptions {
  failureRoute?: string;
  turnId?: string;
  mode?: AgentActionMode;
  approval?: AgentActionApproval;
  executionId?: string;
  // Host-injected control tools for this turn (e.g. the gateway's operator
  // control tools). Forwarded to runAgent; ignored on the approved-execution and
  // read-only paths. Keeps host-specific tools out of the shared registry.
  moduleTools?: Record<string, AgentToolDefinition>;
}

export type ExecuteTurnRunAgent = (
  ctx: AgentContext,
  instruction: string,
  approvedToolCalls: RawToolCall[] | undefined,
  settings: OrgSettings,
  options: ExecuteTurnRunOptions,
) => Promise<AgentResult>;

// Host-injected seams (Track 4.1). The dashboard supplies its Upstash lock,
// thread-io-sink context builder, and ops-alert runAgent wrapper; the gateway
// worker supplies its ioredis lock + own context/runAgent (Track 4.2/4.3).
export interface ExecuteAgentTurnDeps {
  lock: LockProvider;
  buildContext: (
    threadId: string,
    orgId: string,
    mode?: AgentActionMode,
    operatorLedger?: string,
  ) => Promise<AgentContext>;
  runAgent: ExecuteTurnRunAgent;
}

export interface ExecuteAgentTurnParams {
  orgId: string;
  threadId: string;
  instruction: string;
  // Hosts with a durable inbound event may supply its UUID so AgentAction and
  // audit-note rows can be correlated directly during recovery. Other callers
  // keep the generated per-turn identity.
  turnId?: string;
  failureRoute?: string;
  orgSettings?: Partial<OrgSettings> | null;
  approvedToolCalls?: RawToolCall[];
  persistUserMessage?: boolean;
  persistAgentMessage?: boolean;
  persistAuditNote?: boolean;
  persistAuditNoteWhenNoActions?: boolean;
  auditMode?: "human_approved" | "auto_executed" | "read_only";
  approval?: AgentActionApproval;
  executionId?: string;
  // Operator freeform turns only: the host-rendered pending-state ledger passed
  // into buildContext, and the operator control tools passed into runAgent.
  operatorLedger?: string;
  moduleTools?: Record<string, AgentToolDefinition>;
  auditMetadata?: {
    senderPhone?: string | null;
    clerkUserId?: string | null;
  };
}

function requiresFailClosedLock(params: ExecuteAgentTurnParams): boolean {
  return params.auditMode !== "read_only";
}

export async function executeAgentTurn(
  params: ExecuteAgentTurnParams,
  deps: ExecuteAgentTurnDeps,
): Promise<AgentResult> {
  const lock = await deps.lock.acquire(params.threadId, {
    failClosed: requiresFailClosedLock(params),
  });
  if (!lock) {
    throw new ConflictError("Agent is already running on this thread. Try again in a few seconds.");
  }

  try {
    const settings = resolveAgentSettings(params.orgSettings ?? null);

    if (params.persistUserMessage) {
      await createMessage({
        threadId: params.threadId,
        senderType: "customer",
        contentText: params.instruction,
      });
    }

    const turnId = params.turnId ?? randomUUID();
    const ctx = await deps.buildContext(
      params.threadId,
      params.orgId,
      params.auditMode,
      params.operatorLedger,
    );
    const result = await deps.runAgent(
      ctx,
      params.instruction,
      params.approvedToolCalls,
      settings,
      {
        ...(params.failureRoute ? { failureRoute: params.failureRoute } : {}),
        turnId,
        ...(params.auditMode ? { mode: params.auditMode } : {}),
        ...(params.approval ? { approval: params.approval } : {}),
        ...(params.executionId ? { executionId: params.executionId } : {}),
        ...(params.moduleTools ? { moduleTools: params.moduleTools } : {}),
      }
    );

    if (params.persistAgentMessage) {
      await createMessage({
        threadId: params.threadId,
        senderType: "agent",
        contentText: result.summary,
      });
    }

    if ((params.persistAuditNote ?? true) && ((params.persistAuditNoteWhenNoActions ?? true) || result.actionsPerformed.length > 0)) {
      await createMessage({
        threadId: params.threadId,
        senderType: "note",
        contentText: serializeAgentTurn({
          id: turnId,
          instruction: params.instruction,
          actions: result.actionsPerformed,
          summary: result.summary,
          error: null,
          ...(params.auditMode ? { mode: params.auditMode } : {}),
          senderPhone: params.auditMetadata?.senderPhone ?? null,
          clerkUserId: params.auditMetadata?.clerkUserId ?? null,
        }),
      });
    }

    return result;
  } finally {
    await lock.release();
  }
}
