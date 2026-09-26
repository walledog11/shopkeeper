import { createHash } from "node:crypto";
import { createMessage, db, SenderType } from "@shopkeeper/db";
import { stopWaitingTasksOnClosedThreads } from "../task-ledger.js";
import { AGENT_NOTE_PREFIX, THREAD_STATUS } from "../thread-constants.js";
import { toolEscalated, toolError, toolNotFound, toolOk, type ToolResult } from "../tools/result.js";
import type {
  AddInternalNoteInput,
  AskOperatorInput,
  EscalateToHumanInput,
  UpdateThreadStatusInput,
  UpdateThreadTagInput,
} from "../tools/registry/index.js";
import { successfulThreadReceipt } from "./receipts.js";
import type { ThreadMutationHook, ThreadSinkContext } from "./types.js";

async function runHook(hook: ThreadMutationHook | undefined, ctx: ThreadSinkContext): Promise<void> {
  if (!hook) return;
  await hook(ctx);
}

export async function addInternalNoteMutation(
  input: AddInternalNoteInput,
  ctx: ThreadSinkContext,
  after?: ThreadMutationHook,
): Promise<ToolResult> {
  const owned = await db.thread.findFirst({
    where: { id: ctx.threadId, organizationId: ctx.orgId },
    select: { id: true },
  });
  if (!owned) return toolNotFound("Error: thread not found.");
  const message = await createMessage({
    threadId: ctx.threadId,
    organizationId: ctx.orgId,
    senderType: SenderType.note,
    contentText: `${AGENT_NOTE_PREFIX}${input.text}`,
  });
  await runHook(after, ctx);
  const result = toolOk(`Note logged: "${input.text}"`);
  const receipt = successfulThreadReceipt(ctx, "add_internal_note", message.id, {
    threadId: ctx.threadId,
    messageId: message.id,
    contentSha256: createHash("sha256").update(input.text).digest("hex"),
  });
  return receipt ? { ...result, receipt } : result;
}

export async function updateThreadStatusMutation(
  input: UpdateThreadStatusInput,
  ctx: ThreadSinkContext,
  after?: ThreadMutationHook,
): Promise<ToolResult> {
  const observed = await db.$transaction(async (tx) => {
    const before = await tx.thread.findFirst({
      where: { id: ctx.threadId, organizationId: ctx.orgId },
      select: { status: true },
    });
    if (!before) return null;
    const afterRow = await tx.thread.update({
      where: { id: ctx.threadId },
      data: { status: input.status },
      select: { status: true },
    });
    if (afterRow.status === THREAD_STATUS.CLOSED) {
      await stopWaitingTasksOnClosedThreads(tx, { organizationId: ctx.orgId, threadIds: [ctx.threadId] });
    }
    return { before: before.status, after: afterRow.status };
  });
  if (!observed) return toolNotFound("Error: thread not found.");
  await runHook(after, ctx);
  const result = toolOk(`Thread status updated to "${observed.after}".`);
  const receipt = successfulThreadReceipt(ctx, "update_thread_status", ctx.threadId, {
    threadId: ctx.threadId,
    beforeStatus: observed.before,
    afterStatus: observed.after,
  });
  return receipt ? { ...result, receipt } : result;
}

export async function updateThreadTagMutation(
  input: UpdateThreadTagInput,
  ctx: ThreadSinkContext,
  after?: ThreadMutationHook,
): Promise<ToolResult> {
  const observed = await db.$transaction(async (tx) => {
    const before = await tx.thread.findFirst({
      where: { id: ctx.threadId, organizationId: ctx.orgId },
      select: { tag: true },
    });
    if (!before) return null;
    const afterRow = await tx.thread.update({
      where: { id: ctx.threadId },
      data: { tag: input.tag },
      select: { tag: true },
    });
    return { before: before.tag, after: afterRow.tag };
  });
  if (!observed) return toolNotFound("Error: thread not found.");
  await runHook(after, ctx);
  const result = toolOk(`Thread tag updated to "${observed.after}".`);
  const receipt = successfulThreadReceipt(ctx, "update_thread_tag", ctx.threadId, {
    threadId: ctx.threadId,
    beforeTag: observed.before,
    afterTag: observed.after,
  });
  return receipt ? { ...result, receipt } : result;
}

export async function escalateToHumanMutation(
  input: EscalateToHumanInput,
  ctx: ThreadSinkContext,
  hooks?: {
    after?: ThreadMutationHook;
    onEscalated?: (ctx: ThreadSinkContext, reason: string) => void | Promise<void>;
  },
): Promise<ToolResult> {
  const reason = input.reason.trim() || "No reason provided";
  const updated = await db.thread.updateMany({
    where: { id: ctx.threadId, organizationId: ctx.orgId },
    data: { status: THREAD_STATUS.OPEN, tag: "needs_human", escalatedAt: new Date() },
  });
  if (updated.count !== 1) return toolError("Error: thread not found.");
  await createMessage({
    threadId: ctx.threadId,
    organizationId: ctx.orgId,
    senderType: SenderType.note,
    contentText: `${AGENT_NOTE_PREFIX}Escalated to merchant: ${reason}`,
  });
  if (hooks?.onEscalated) {
    await hooks.onEscalated(ctx, reason);
  }
  await runHook(hooks?.after, ctx);
  return toolEscalated(reason);
}

export async function askOperatorMutation(
  input: AskOperatorInput,
  ctx: ThreadSinkContext,
  after?: ThreadMutationHook,
): Promise<ToolResult> {
  const question = input.question.trim() || "No question provided";
  const owned = await db.thread.findFirst({
    where: { id: ctx.threadId, organizationId: ctx.orgId },
    select: { id: true },
  });
  if (!owned) return toolError("Error: thread not found.");
  await createMessage({
    threadId: ctx.threadId,
    organizationId: ctx.orgId,
    senderType: SenderType.note,
    contentText: `${AGENT_NOTE_PREFIX}Asked the merchant: ${question}`,
  });
  await runHook(after, ctx);
  return toolOk(question);
}
