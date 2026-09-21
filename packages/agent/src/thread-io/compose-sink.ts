import {
  addInternalNoteMutation,
  askOperatorMutation,
  escalateToHumanMutation,
  updateThreadStatusMutation,
  updateThreadTagMutation,
} from "./db-mutations.js";
import type { ThreadSink, ThreadSinkHooks } from "./types.js";

export interface ComposeThreadSinkOptions extends ThreadSinkHooks {
  sendReply: ThreadSink["sendReply"];
  sendEmail: ThreadSink["sendEmail"];
}

/** Builds a full {@link ThreadSink} from host-specific send paths plus optional hooks. */
export function composeThreadSink(options: ComposeThreadSinkOptions): ThreadSink {
  const after = options.afterMutation;
  return {
    addInternalNote: (input, ctx) => addInternalNoteMutation(input, ctx, after),
    updateThreadStatus: (input, ctx) => updateThreadStatusMutation(input, ctx, after),
    updateThreadTag: (input, ctx) => updateThreadTagMutation(input, ctx, after),
    escalateToHuman: (input, ctx) => escalateToHumanMutation(input, ctx, {
      after,
      onEscalated: options.onEscalated,
    }),
    askOperator: (input, ctx) => askOperatorMutation(input, ctx, after),
    sendReply: options.sendReply,
    sendEmail: options.sendEmail,
  };
}

export type { ThreadSinkContext, ThreadSinkHooks, ThreadSink } from "./types.js";
