import { createHash } from "node:crypto";
import { createMessage, db, Prisma, SenderType } from "@shopkeeper/db";
import { parseClassifierSignals, parseRequestFacts } from "../classifier-signals.js";
import { normalizeOrderName } from "../order-reference.js";
import {
  mergeOrderVerificationRequest,
  ORDER_VERIFICATION_ANSWER_WINDOW_MS,
  ORDER_VERIFICATION_CHANNELS,
  ORDER_VERIFICATION_MAX_ASKS,
  orderVerificationAttemptsLeft,
} from "../order-verification.js";
import { stopWaitingTasksOnClosedThreads } from "../task-ledger/index.js";
import { AGENT_NOTE_PREFIX, THREAD_STATUS } from "../thread-constants.js";
import { toolEscalated, toolError, toolNotFound, toolOk, type ToolResult } from "../tools/result.js";
import type {
  AddInternalNoteInput,
  AskOperatorInput,
  AwaitCustomerPhotoInput,
  AwaitOrderVerificationInput,
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

// Records the photo request the customer is now answering. Set regardless of
// status: the request went out, so a reopened thread is still waiting on it.
// Closing the thread is what ends the wait (stopWaitingTasksOnClosedThreads).
export async function awaitCustomerPhotoMutation(
  _input: AwaitCustomerPhotoInput,
  ctx: ThreadSinkContext,
  after?: ThreadMutationHook,
): Promise<ToolResult> {
  const updated = await db.thread.updateMany({
    where: { id: ctx.threadId, organizationId: ctx.orgId },
    data: { awaitingCustomer: "damage_photo", awaitingCustomerSince: new Date() },
  });
  if (updated.count !== 1) return toolNotFound("Error: thread not found.");
  await runHook(after, ctx);
  return toolOk("Waiting for the customer's photo of the damage.");
}

const ORDER_NAME_SHAPE = /^#[A-Z0-9-]{1,32}$/;

// Records that the reply asks this sender which order this is about, or to
// confirm an order is theirs. Keyed to the sender, the store and the order, so
// a later episode resumes the same row rather than starting fresh. It writes no
// attempt and no outcome: gateway code compares the answer
// (order-verification-answer). The ask for which order keeps the request it was
// made about, and the ask that names the order carries it on.
export async function awaitOrderVerificationMutation(
  input: AwaitOrderVerificationInput,
  ctx: ThreadSinkContext,
  after?: ThreadMutationHook,
): Promise<ToolResult> {
  const thread = await db.thread.findFirst({
    where: { id: ctx.threadId, organizationId: ctx.orgId },
    select: { customerId: true, channelType: true, classifierSignals: true, requestSourceMessageId: true },
  });
  if (!thread) return toolNotFound("Error: thread not found.");
  if (!ORDER_VERIFICATION_CHANNELS.has(thread.channelType)) {
    return toolError("Error: order confirmation applies to Instagram and TikTok conversations only.");
  }
  const rawName = String(input.order_name ?? "").trim();
  // Stored, then written into later prompts and the merchant's card, so only
  // an order number's shape is kept: the model took it from customer text.
  const orderName = rawName === "" ? null : normalizeOrderName(rawName);
  if (orderName !== null && !ORDER_NAME_SHAPE.test(orderName)) {
    return toolError("Error: order_name must be an order number, e.g. #1043.");
  }

  const integration = await db.integration.findFirst({
    where: { organizationId: ctx.orgId, platform: "shopify", lifecycleStatus: "active" },
    select: { externalAccountId: true },
  });
  if (!integration) return toolError("Error: no Shopify store is connected to check the order against.");
  const sender = { organizationId: ctx.orgId, customerId: thread.customerId, shopDomain: integration.externalAccountId };
  const records = await db.orderVerification.findMany({
    where: sender,
    select: {
      id: true, orderName: true, threadId: true, requestedAt: true, asks: true, attempts: true,
      verifiedAt: true, requestFacts: true, compensationRequested: true,
    },
  });
  const now = new Date();
  // The "which order?" ask belongs to the conversation it was asked in, as the
  // planner reads it: one left on another thread, or past the window, is over.
  const unnamedRow = records.find(record => record.orderName === null);
  const unnamedHere = unnamedRow
    && unnamedRow.threadId === ctx.threadId
    && now.getTime() - unnamedRow.requestedAt.getTime() < ORDER_VERIFICATION_ANSWER_WINDOW_MS
    ? unnamedRow
    : null;
  const staleUnnamed = unnamedRow && !unnamedHere ? unnamedRow : null;
  const existing = orderName === null ? unnamedHere : records.find(record => record.orderName === orderName);
  if (existing?.verifiedAt) return toolOk(`The customer already confirmed ${orderName}.`);
  if (orderVerificationAttemptsLeft(records) === 0 || (existing && existing.asks >= ORDER_VERIFICATION_MAX_ASKS)) {
    return toolError("Error: this sender cannot be asked again. Hand the conversation to the merchant.");
  }

  // The request this message makes, when it is one that needs the order
  // confirmed; a reply that only names the order keeps the one it answers.
  const signals = parseClassifierSignals(thread.classifierSignals);
  const latestCustomerMessage = await db.message.findFirst({
    where: { threadId: ctx.threadId, organizationId: ctx.orgId, senderType: SenderType.customer, deletedAt: null },
    orderBy: [{ sentAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  const aligned = signals !== null && latestCustomerMessage !== null
    && thread.requestSourceMessageId === latestCustomerMessage.id;
  const storedRequest = (record: { requestFacts: unknown; compensationRequested: boolean } | null | undefined) => (
    record?.requestFacts ? { facts: parseRequestFacts(record.requestFacts), compensation: record.compensationRequested } : null
  );
  const request = mergeOrderVerificationRequest(
    aligned ? { facts: signals.requestFacts, compensation: signals.intents.compensation_request } : null,
    storedRequest(unnamedHere) ?? (orderName === null ? null : storedRequest(existing)),
  );

  const stored = request
    ? { requestFacts: request.facts, compensationRequested: request.compensation }
    : {};
  await db.$transaction(async (tx) => {
    if (staleUnnamed) await tx.orderVerification.delete({ where: { id: staleUnnamed.id } });
    if (existing) {
      await tx.orderVerification.update({
        where: { id: existing.id },
        data: { threadId: ctx.threadId, requestedAt: now, asks: { increment: 1 }, ...stored },
      });
    } else {
      await tx.orderVerification.create({
        data: {
          ...sender, threadId: ctx.threadId, orderName, requestedAt: now,
          requestFacts: request?.facts ?? Prisma.DbNull,
          compensationRequested: request?.compensation ?? false,
        },
      });
    }
    // The order is named now, so the ask for which order is answered.
    if (orderName !== null && unnamedHere) await tx.orderVerification.delete({ where: { id: unnamedHere.id } });
  });
  await runHook(after, ctx);
  return toolOk(orderName === null
    ? "Waiting for the customer to say which order."
    : `Waiting for the customer to confirm ${orderName}.`);
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
