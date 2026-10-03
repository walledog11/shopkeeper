import type { TaskModelBudget } from "./agent-context.js";
import { ConflictError } from "./errors.js";
import logger from "./logger.js";
import { estimateModelUsageCostUsd, UnknownModelPriceError } from "./model-cost.js";
import {
  recordAgentTaskModelUsage, renewAgentTaskLease, reserveAgentTaskModelCall,
  type ActiveTaskClaim,
} from "./task-ledger.js";

export function taskModelBudget(claim: ActiveTaskClaim): TaskModelBudget {
  return {
    reserveModelCall: async () => {
      const state = await reserveAgentTaskModelCall(claim);
      if (state !== "active") throw new ConflictError(`Task stopped: ${state}.`);
    },
    recordModelUsage: async (usage, model) => {
      let spentNanoUsd = 0n;
      try {
        spentNanoUsd = BigInt(Math.ceil(estimateModelUsageCostUsd(model, usage) * 1_000_000_000));
      } catch (error) {
        if (!(error instanceof UnknownModelPriceError)) throw error;
        logger.warn({ model, taskId: claim.taskId }, "[AgentTask] Unpriced model; call counted without spend");
      }
      const recorded = await recordAgentTaskModelUsage({
        ...claim,
        usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, spentNanoUsd },
      });
      if (!recorded) throw new ConflictError("Task claim was lost while recording model usage.");
    },
  };
}

export interface TaskRunControl {
  taskBudget: TaskModelBudget;
  assertExecutionAllowed: () => void;
}

/** Keep an in-process continuation under the same lease and budget as queued work. */
export async function withAgentTaskClaim<T>(
  claim: ActiveTaskClaim,
  work: (control: TaskRunControl) => Promise<T>,
): Promise<T> {
  let leaseLost = false;
  const assertExecutionAllowed = () => {
    if (leaseLost) throw new ConflictError("Task lease ownership was lost.");
  };
  const renewal = setInterval(() => {
    void renewAgentTaskLease({ ...claim, leaseMs: 300_000 }).then(renewed => {
      if (!renewed) leaseLost = true;
    }).catch(error => {
      leaseLost = true;
      logger.error({ err: error, taskId: claim.taskId }, "[AgentTask] Lease renewal failed");
    });
  }, 60_000);
  renewal.unref();
  try {
    return await work({ taskBudget: taskModelBudget(claim), assertExecutionAllowed });
  } finally {
    clearInterval(renewal);
  }
}
