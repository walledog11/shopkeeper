import type { ToolResult } from "../tools/result.js";
import type {
  AddInternalNoteInput,
  AskOperatorInput,
  EscalateToHumanInput,
  SendEmailInput,
  SendReplyInput,
  UpdateThreadStatusInput,
  UpdateThreadTagInput,
} from "../tools/registry/index.js";

/** Identity passed into every thread-coupled tool implementation. */
export interface ThreadSinkContext {
  agentActionMode?: import("../agent-context.js").AgentActionMode;
  threadId: string;
  orgId: string;
  orgName: string;
  operationId?: string;
  executionId?: string;
  agentRequestId?: string;
  agentTaskId?: string;
}

export type ThreadMutationHook = (ctx: ThreadSinkContext) => void | Promise<void>;

export interface ThreadSinkHooks {
  afterMutation?: ThreadMutationHook;
  onEscalated?: (ctx: ThreadSinkContext, reason: string) => void | Promise<void>;
}

export interface ThreadSink {
  escalateToHuman(input: EscalateToHumanInput, ctx: ThreadSinkContext): Promise<ToolResult>;
  askOperator(input: AskOperatorInput, ctx: ThreadSinkContext): Promise<ToolResult>;
  addInternalNote(input: AddInternalNoteInput, ctx: ThreadSinkContext): Promise<ToolResult>;
  sendReply(input: SendReplyInput, ctx: ThreadSinkContext): Promise<ToolResult>;
  sendEmail(input: SendEmailInput, ctx: ThreadSinkContext): Promise<ToolResult>;
  updateThreadStatus(input: UpdateThreadStatusInput, ctx: ThreadSinkContext): Promise<ToolResult>;
  updateThreadTag(input: UpdateThreadTagInput, ctx: ThreadSinkContext): Promise<ToolResult>;
}
