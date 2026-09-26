import logger from "./logger.js";
import { randomUUID } from "node:crypto";
import {
  authorizeAgentActionDispatch,
  beginAgentActionAttempt,
  completeAgentActionAttempt,
  failAgentActionBeforeDispatch,
  markAgentActionSubmitted,
  type AgentActionTaskAuthority,
} from "./agent-actions.js";
import { buildCachedSystemPrompt, buildSplitCachedSystemPrompt } from "./ai/anthropic.js";
import { pickModel } from "./ai/index.js";
import type { OrgSettings, RawToolCall } from "./types.js";
import {
  selectAgentTools,
  TOOL_CATEGORIES,
  type AgentToolDefinition,
} from "./tools/registry/index.js";
import { buildSystemPromptParts, buildComposerAskPrompt } from "./prompt.js";
import { isOperatorChannel } from "./intent.js";
import { buildMessageHistory } from "./message-history.js";
import { runAgentLoop } from "./agent-loop.js";
import {
  hasUnresolvedShopifyCustomer,
  isGuestOnlyTool,
  isStorefrontAllowedTool,
  storefrontToolNames,
} from "./guest-policy.js";
import type { ActionEntry, BaseAgentContext, AgentResult } from "./agent-context.js";
import type { PersistedAgentAction } from "./agent-actions.js";
import { createModelUsageMetrics, hashInstructionForLog } from "./usage.js";
import { enforceSpendCap } from "./spend.js";
import {
  READ_TOOL_NAMES,
  TOKEN_BUDGET,
  resolveRunPolicy,
  type RunAgentPolicyOptions,
} from "./run-policy.js";
import {
  approvedActionsCompleteOutcome,
  selectExecutableApprovedToolCalls,
  summarizeApprovedDashboardActions,
} from "./run-approved-actions.js";
import { summarizeOperatorTurnDispatchFailure } from "./message-dispatch.js";
import {
  createAgentFailureRecorder,
  executeAgentToolCalls,
  finishAgentRun,
  isSupportContext,
  type RecordToolFailure,
} from "./run-execution.js";
import {
  CONTEXT_BUDGETS,
  truncateContextText,
} from "./context-budget.js";
import type { CompletionFact } from "./completion-facts.js";

export interface RunAgentOptions extends RunAgentPolicyOptions {
  // Injected tool-failure recorder. The dashboard wires this to its ops-alert
  // counter; a thread-less / gateway host may omit it. Keeping it injected is
  // what keeps alerting infra (env, ops-alerts) out of the shared core.
  recordToolFailure?: RecordToolFailure;
  // Pre-generated turn id so the caller can embed it in the agent-turn note
  // and join AgentAction rows back to the note when rendering inline.
  turnId?: string;
  onActionsPersisted?: (actions: PersistedAgentAction[]) => void;
  // Host-injected module tools appended to the selected tool set for this run
  // (e.g. the gateway's operator control tools). Resolved ahead of the shared
  // registry by the executor. Ignored in read-only mode. Keeping them injected
  // keeps host-specific tools out of the shared registry.
  moduleTools?: Record<string, AgentToolDefinition>;
  // Shadow/enforced durable plan execution row that owns this run's actions.
  executionId?: string;
  taskAuthority?: AgentActionTaskAuthority;
  // Successful facts established by live reads during planning. Approved plans
  // do not re-run those reads, so their evidence travels with the execution.
  completionEvidence?: readonly CompletionFact[];
}

const OPERATOR_HIDDEN_TOOL_NAMES = new Set([
  "escalate_to_human",
  "send_reply",
  "add_internal_note",
]);

export async function runAgent(
  ctx: BaseAgentContext,
  instruction: string,
  approvedToolCalls?: RawToolCall[],
  settings?: OrgSettings,
  options?: RunAgentOptions,
): Promise<AgentResult> {
  const startedAt = Date.now();
  const usageTotals = createModelUsageMetrics();
  const executedToolCalls: string[] = [];
  const instructionHash = hashInstructionForLog(instruction);
  const {
    approval,
    effectiveMode,
    maxIterations,
    readOnly,
    settings: s,
  } = resolveRunPolicy(settings, options);
  const recordToolFailure = options?.recordToolFailure;
  const actionsPerformed: ActionEntry[] = [];
  const journaledActions = new Set<ActionEntry>();
  const turnId = options?.turnId ?? randomUUID();
  // Thread/customer are present only on a SupportContext; capture them once so the
  // thread-less path (Track 3) logs/audits with nulls instead of dereferencing.
  const supportThread = isSupportContext(ctx) ? ctx.thread : null;
  const supportCustomer = isSupportContext(ctx) ? ctx.customer : null;
  const operatorMode = supportThread != null && isOperatorChannel(supportThread.channelType);
  const gatewayOperatorMode = supportThread?.channelType === "operator";
  const failureAlertPromises: Promise<unknown>[] = [];
  let escalationReason: string | null = null;
  const finish = (result: AgentResult, outcome: string) => finishAgentRun({
    ctx,
    result,
    outcome,
    failureAlertPromises,
    supportThread,
    supportCustomer,
    effectiveMode,
    instruction,
    summaryStartedAt: startedAt,
    usageTotals,
    readOnly,
    approvedToolCallCount: approvedToolCalls?.length ?? 0,
    executedToolCalls,
    instructionHash,
    turnId,
    journaledActions,
    ...(approval ? { approval } : {}),
    ...(options?.executionId ? { executionId: options.executionId } : {}),
    ...(options?.onActionsPersisted
      ? { onActionsPersisted: options.onActionsPersisted }
      : {}),
  });
  const recordAgentFailureSafely = createAgentFailureRecorder({
    ctx,
    readOnly,
    recordToolFailure,
    supportThread,
    failureAlertPromises,
  });
  let actionIndex = 0;
  const executeToolCalls = (
    toolCalls: { id: string; name: string; input: unknown }[],
    executionOptions?: { stopOnDefiniteFailure?: boolean },
  ) =>
    executeAgentToolCalls(toolCalls, {
      ctx,
      settings,
      readOnly,
      supportThread,
      actionsPerformed,
      executedToolCalls,
      completionEvidence: options?.completionEvidence,
      beginAction: async (call, operationId, providerOperationKey) => {
        const attempt = await beginAgentActionAttempt({
          orgId: ctx.orgId,
          threadId: supportThread?.id,
          customerId: supportCustomer?.id,
          mode: effectiveMode,
          turnId,
          instruction,
          approval,
          executionId: options?.executionId,
          taskAuthority: options?.taskAuthority,
          operationId,
          actionIndex: actionIndex++,
          action: {
            tool: call.name,
            input: call.input,
            providerOperationKey,
            category: options?.moduleTools?.[call.name]?.category,
          },
        });
        return {
          authorizeDispatch: () => authorizeAgentActionDispatch(attempt),
          markSubmitted: () => markAgentActionSubmitted(attempt),
          failBeforeDispatch: (action) => failAgentActionBeforeDispatch(attempt, action),
          complete: async (action) => {
            journaledActions.add(action);
            await completeAgentActionAttempt(attempt, action);
            try {
              options?.onActionsPersisted?.([{
                id: attempt.id,
                category: options?.moduleTools?.[call.name]?.category
                  ?? TOOL_CATEGORIES[call.name]
                  ?? "unknown",
                organizationId: ctx.orgId,
                status: action.status ?? "success",
                tool: call.name,
              }]);
            } catch (err) {
              logger.error({ err, turnId }, "[agent] action observer failed");
            }
          },
        };
      },
      recordAgentFailure: recordAgentFailureSafely,
      setEscalationReason: reason => {
        escalationReason = reason;
      },
      ...(options?.moduleTools ? { moduleTools: options.moduleTools } : {}),
      operationScopeId: options?.executionId ?? turnId,
      ...(executionOptions?.stopOnDefiniteFailure
        ? { stopOnDefiniteFailure: true }
        : {}),
    });

  try {
    // An approved plan runs exactly the calls the merchant approved — its
    // customer message included, as drafted — and nothing the model writes after.
    if (!readOnly && approvedToolCalls && approvedToolCalls.length > 0) {
      const executableToolCalls = selectExecutableApprovedToolCalls(approvedToolCalls);

      await executeToolCalls(executableToolCalls, { stopOnDefiniteFailure: true });

      if (escalationReason) {
        return finish({
          summary: `Escalated to merchant: ${escalationReason}`,
          actionsPerformed,
        }, "escalated");
      }

      return finish({
        summary: summarizeApprovedDashboardActions(actionsPerformed),
        actionsPerformed,
      }, approvedActionsCompleteOutcome());
    }

    // The operator channel is now one durable thread per binding, so its history is
    // the merchant's real conversation — widen the window from the legacy 4. Composer
    // read-only stays narrow.
    const history = operatorMode
      ? ctx.recentMessages.slice(-20)
      : readOnly
        ? ctx.recentMessages.slice(-4)
        : ctx.recentMessages;
    const boundedInstruction = truncateContextText(instruction, CONTEXT_BUDGETS.instructionChars);
    const messageInstruction = readOnly
      ? `Private question from the support operator. Do not contact the customer.\n\n${boundedInstruction}`
      : boundedInstruction;
    const messages = buildMessageHistory(history, messageInstruction, { segregateUntrusted: !operatorMode });
    // runAgent is the support/composer entry: it builds a support-shaped system
    // prompt and tool set. Thread-less modules (order-ops and later) run through the
    // shared loop (runAgentLoop) via their own entrypoint, not here — the executor
    // and loop are thread-optional, so nothing blocks them.
    if (!isSupportContext(ctx)) {
      return finish({ summary: "This agent run requires a support context.", actionsPerformed }, "unsupported_context");
    }
    // Storefront narrowing composes with read-only rather than replacing it: a
    // composer-ask on a storefront thread gets the intersection, which is the
    // stricter of the two in every case.
    const storefrontTools = storefrontToolNames(ctx);
    const storefrontMode = storefrontTools !== null;
    const grantedScopes = ctx.shopify?.grantedScopes ?? null;
    // Mirrors the planner: a thread with no Shopify customer behind it reaches
    // the guest-safe shipping read, so an approved plan can execute the step the
    // planner was allowed to draft.
    const guestOnlyReachable = storefrontMode || hasUnresolvedShopifyCustomer(ctx, operatorMode);
    const selectedCoreTools = readOnly
      ? selectAgentTools(settings, storefrontMode
          ? READ_TOOL_NAMES.filter((name) => isStorefrontAllowedTool(ctx, name))
          : READ_TOOL_NAMES, grantedScopes).filter((tool) => guestOnlyReachable || !isGuestOnlyTool(tool.name))
      : selectAgentTools(settings, storefrontTools, grantedScopes).filter((tool) => (
          (guestOnlyReachable || !isGuestOnlyTool(tool.name))
          && (!gatewayOperatorMode || !OPERATOR_HIDDEN_TOOL_NAMES.has(tool.name))
        ));
    const tools = readOnly
      ? selectedCoreTools
      : [
        ...selectedCoreTools,
        ...Object.values(options?.moduleTools ?? {}).map((def) => ({
          name: def.name,
          description: def.description,
          input_schema: def.inputSchema,
        })),
      ];
    let systemPromptBlocks;
    if (readOnly) {
      systemPromptBlocks = buildCachedSystemPrompt(buildComposerAskPrompt(ctx, settings));
    } else {
      const { stable, volatile } = buildSystemPromptParts(ctx, settings);
      systemPromptBlocks = buildSplitCachedSystemPrompt(stable, volatile);
    }
    // The read-only composer-ask loop stays on Haiku; the mutative agent loop
    // (operator + end-to-end runs) is a judgment/mutative path, so it runs on Sonnet.
    const iterationModel = pickModel(readOnly ? "composer_ask" : "agent_run");

    // Spend cap is a backstop, not a per-call meter — check once before the model
    // loop. The approved-execution path above returns with zero model calls, so it
    // is ungated.
    await enforceSpendCap(ctx.orgId, s);

    const loop = await runAgentLoop({
      ctx,
      mode: readOnly ? "read_only" : "execute",
      messages,
      systemPromptBlocks,
      tools,
      model: iterationModel,
      maxIterations,
      maxTokensPerCall: readOnly ? 2048 : 4096,
      settings,
      usageTotals,
      runTools: executeToolCalls,
      getEscalationReason: () => escalationReason,
      ...(readOnly ? {} : { tokenBudget: TOKEN_BUDGET }),
    });

    switch (loop.stop) {
      case "escalated":
        return finish({
          summary: `Escalated to merchant: ${escalationReason}`,
          actionsPerformed,
        }, "escalated");
      case "max_iterations":
        return finish({
          summary: gatewayOperatorMode
            ? (summarizeOperatorTurnDispatchFailure(actionsPerformed)
              ?? (readOnly
                ? "I could not finish answering that. Try asking a narrower question."
                : "Reached maximum steps without completing the task."))
            : readOnly
              ? "I could not finish answering that. Try asking a narrower question."
              : "Reached maximum steps without completing the task.",
          actionsPerformed,
        }, "max_iterations");
      case "max_tokens":
        return finish({
          summary: readOnly
            ? "The answer was cut off because the request was too large. Try asking a more specific question."
            : "Agent response was cut off - the request may be too complex. Try breaking it into smaller steps.",
          actionsPerformed,
        }, "max_tokens");
      case "token_budget": {
        const dispatchFailure = gatewayOperatorMode
          ? summarizeOperatorTurnDispatchFailure(actionsPerformed)
          : null;
        // The budget is a token ceiling, not a step count, and it is reached mid-turn
        // with nothing sent. Saying "too many steps" described a four-call turn as
        // the merchant's fault for asking too much, and said nothing about whether
        // the customer had been written to. Say what is true: it stopped, and
        // nothing went out.
        return finish({
          summary: dispatchFailure
            ?? loop.finalText?.trim()
            ?? "I ran out of room to finish that one, so I stopped before sending anything. Tell me the ticket or customer and I'll go straight at it.",
          actionsPerformed,
        }, "token_budget");
      }
      default:
        return finish({
          summary: readOnly
            ? (loop.finalText?.trim() || "I do not have enough information to answer that.")
            : (loop.finalText ?? "Done."),
          actionsPerformed,
        }, "end_turn");
    }
  } catch (error) {
    await finish({
      summary: "Execution stopped unexpectedly. Review the recorded actions before retrying.",
      actionsPerformed,
    }, "error");
    throw error;
  }

}
