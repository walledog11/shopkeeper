import { createHash } from "node:crypto";
import { createMessage, db, Prisma, SenderType } from "@shopkeeper/db";
import { parseClassifierSignals } from "../classifier-signals.js";
import { normalizeOrderName } from "../order-reference.js";
import {
  ORDER_VERIFICATION_CHANNELS,
  ORDER_VERIFICATION_MAX_ASKS,
  orderVerificationAttemptsLeft,
  requestNeedsOrderVerification,
} from "../order-verification.js";
import { stopWaitingTasksOnClosedThreads } from "../task-ledger.js";
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

// Records that the reply asks this sender to confirm an order, or, with no
// order named, to say which order. Keyed to the sender and the order, so a later
// episode resumes the same row rather than starting fresh. It writes no attempt
// and no outcome: gateway code compares the answer (order-verification-answer).
// The comparison starts at the first ask and a re-ask leaves it there, so an
// answer that arrived before a re-ask is still compared.
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
  if (rawName === "") return toolOk("Waiting for the customer to say which order.");
  // Stored, then written into later prompts and the merchant's card, so only
  // an order number's shape is kept: the model took it from customer text.
  const orderName = normalizeOrderName(rawName);
  if (!ORDER_NAME_SHAPE.test(orderName)) return toolError("Error: order_name must be an order number, e.g. #1043.");

  const integration = await db.integration.findFirst({
    where: { organizationId: ctx.orgId, platform: "shopify", lifecycleStatus: "active" },
    select: { id: true },
  });
  if (!integration) return toolError("Error: no Shopify store is connected to check the order against.");
  const records = await db.orderVerification.findMany({
    where: { organizationId: ctx.orgId, customerId: thread.customerId },
    select: { orderName: true, integrationId: true, asks: true, attempts: true, verifiedAt: true },
  });
  const existing = records.find(record => record.orderName === orderName);
  const sameStore = records.filter(record => record.integrationId === integration.id);
  if (existing?.integrationId === integration.id && existing.verifiedAt) {
    return toolOk(`The customer already confirmed ${orderName}.`);
  }
  if (
    orderVerificationAttemptsLeft(sameStore) === 0
    || (existing?.integrationId === integration.id && existing.asks >= ORDER_VERIFICATION_MAX_ASKS)
  ) {
    return toolError("Error: this sender cannot be asked again. Hand the conversation to the merchant.");
  }

  // The request this message makes, kept to resume once the order is confirmed.
  // A reply that only answers the ask keeps the request it answers.
  const signals = parseClassifierSignals(thread.classifierSignals);
  const latestCustomerMessage = await db.message.findFirst({
    where: { threadId: ctx.threadId, organizationId: ctx.orgId, senderType: SenderType.customer, deletedAt: null },
    orderBy: [{ sentAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  const aligned = signals !== null && latestCustomerMessage !== null
    && thread.requestSourceMessageId === latestCustomerMessage.id;
  const request = aligned && requestNeedsOrderVerification(signals.requestFacts) ? signals.requestFacts : null;

  const key = {
    organizationId_customerId_orderName: {
      organizationId: ctx.orgId, customerId: thread.customerId, orderName,
    },
  };
  const now = new Date();
  await db.$transaction(async (tx) => {
    // A row from a store since replaced describes another store's order.
    if (existing && existing.integrationId !== integration.id) {
      await tx.orderVerification.delete({ where: key });
    }
    await tx.orderVerification.upsert({
      where: key,
      create: {
        organizationId: ctx.orgId, customerId: thread.customerId, integrationId: integration.id,
        threadId: ctx.threadId, orderName, requestedAt: now, evaluatedThrough: now,
        requestFacts: request ?? Prisma.DbNull,
      },
      update: {
        threadId: ctx.threadId, requestedAt: now, asks: { increment: 1 },
        ...(request ? { requestFacts: request } : {}),
      },
    });
  });
  await runHook(after, ctx);
  return toolOk(`Waiting for the customer to confirm ${orderName}.`);
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
