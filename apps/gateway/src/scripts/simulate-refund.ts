/**
 * Runs the live Instagram refund test end to end against a deployed gateway, so
 * nobody has to type it on a phone: resets the test customer, sends "I'd like a
 * full refund on order #…" as a signed SocialAPI webhook, answers the zip ask
 * with the order's zip, approves the refund card the way the dashboard's Approve
 * does (filling its refund-timing blank with --refund-timing while the store's
 * timing is not in Memory, which saves it), then checks the reply reached
 * Instagram and Shopify holds the refund. Without --refund-timing, answer the
 * card on the phone. Prints each step as PASS or FAIL, every message the
 * customer and the phone got, and the timings.
 *
 * The customer's messages are injected, so they do not show in Instagram; the
 * agent's replies are real sends and do. Instagram only lets the store reply
 * within 24 hours of the customer's last real message, so the run stops first if
 * that window is closed. The card is still texted to the phone. Each run issues
 * a real refund on the store and spends a few cents of model calls.
 *
 *   railway run --service shopkeeper --environment production -- \
 *     npm run simulate:refund -- --workspace <clerk_org_id> --instagram <test handle> \
 *       [--refund-timing "5-10 business days"] [--order #1051] [--execute]
 * Dry run (checks only) unless --execute. Needs DATABASE_URL, TOKEN_ENCRYPTION_KEY,
 * SOCIALAPI_API_KEY, SOCIALAPI_WEBHOOK_SECRET, INTERNAL_API_SECRET and the
 * gateway's public URL (RAILWAY_PUBLIC_DOMAIN, or --gateway).
 */
import { createHmac, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { db } from '@shopkeeper/db';
import { memberOperatorKey } from '@shopkeeper/agent/internal-thread';
import { getAgentTurnPrefixLength } from '@shopkeeper/agent/tools';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { shopifyRestJson } from '@shopkeeper/agent/shopify';
import { createSocialApiClient, type SocialApiInstagramConversation } from '@shopkeeper/integrations/socialapi';
import { blankAnswersInCalls, merchantAnswerSlotsInCalls } from '@shopkeeper/agent/reply-placeholders';
import { getSocialApiApiKey } from '../config/runtime-config.js';
import { readPendingPlanArray, readPendingQuestion, type PendingPlan } from '../operator-context/serialization.js';
import { eraseCustomers } from '../routes/shopify-compliance.js';
import { findInstagramConversations } from './live-test-instagram.js';

const { values } = parseArgs({
  options: {
    workspace: { type: 'string' },
    instagram: { type: 'string' },
    'refund-timing': { type: 'string' },
    order: { type: 'string' },
    gateway: { type: 'string' },
    timeout: { type: 'string', default: '180' },
    execute: { type: 'boolean', default: false },
  },
});

const POLL_MS = 1_500;
// Margin under Instagram's 24 hours, so the window cannot close mid-run.
const REPLY_WINDOW_MS = 23 * 60 * 60 * 1_000;
// Writes that return the customer's money. Cancelling an unshipped paid order
// refunds it (decision H), so a card may carry cancel_order instead of a refund.
const REFUND_TOOLS = new Set(['create_refund', 'create_partial_refund', 'cancel_order']);
const SEND_DONE = new Set(['sent', 'failed', 'unknown', 'bounced']);
const stepTimeoutMs = Number(values.timeout) * 1_000;

class StepFailed extends Error {}

const runStartedAt = Date.now();
const since = (at: number) => `+${((at - runStartedAt) / 1_000).toFixed(1)}s`;
const seconds = (ms: number) => `${(ms / 1_000).toFixed(1)}s`;
const indent = (text: string) => text.split('\n').map(line => `        ${line}`).join('\n');

/** An agent run record shows as its summary, not its stored JSON. */
function displayText(text: string): string {
  const prefix = getAgentTurnPrefixLength(text);
  if (prefix === null) return text;
  try {
    const summary = (JSON.parse(text.slice(prefix)) as { summary?: unknown }).summary;
    return `Agent run: ${typeof summary === 'string' ? summary : '(no summary)'}`;
  } catch {
    return 'Agent run: (unreadable record)';
  }
}

const steps: Array<{ name: string; ok: boolean; ms: number; detail?: string }> = [];
async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await run();
    steps.push({ name, ok: true, ms: Date.now() - startedAt });
    console.log(`PASS  ${name} (${seconds(Date.now() - startedAt)})`);
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    steps.push({ name, ok: false, ms: Date.now() - startedAt, detail });
    console.log(`FAIL  ${name} (${seconds(Date.now() - startedAt)})\n${indent(detail)}`);
    throw new StepFailed(detail);
  }
}

// ── Live view of the ticket and the phone ─────────────────────────────────────

interface Watched {
  ticketId: string | null;
  /** The merchant's operator thread, where every card sent to the phone is mirrored. */
  memberKey: string | null;
  operatorThreadId: string | null;
  seen: Set<string>;
  phone: Array<{ at: Date; text: string }>;
}
const watched: Watched = { ticketId: null, memberKey: null, operatorThreadId: null, seen: new Set(), phone: [] };

/** Prints each new message once: customer sends once their delivery settles. */
async function printNewMessages(organizationId: string, after: Date): Promise<void> {
  // Created by the first card if the merchant has never had one.
  if (!watched.operatorThreadId && watched.memberKey) {
    watched.operatorThreadId = (await db.thread.findFirst({
      where: { organizationId, operatorKey: watched.memberKey },
      select: { id: true },
    }))?.id ?? null;
  }
  const threadIds = [watched.ticketId, watched.operatorThreadId].filter((id): id is string => Boolean(id));
  if (threadIds.length === 0) return;
  const messages = await db.message.findMany({
    where: { organizationId, threadId: { in: threadIds }, sentAt: { gte: after }, deletedAt: null },
    orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
    select: { id: true, threadId: true, senderType: true, contentText: true, sendStatus: true, sendError: true, sentAt: true },
  });
  for (const message of messages) {
    if (watched.seen.has(message.id)) continue;
    const onPhone = message.threadId === watched.operatorThreadId;
    // The operator turn's run record repeats its reply and never reaches the phone.
    if (onPhone && getAgentTurnPrefixLength(message.contentText ?? '') !== null) {
      watched.seen.add(message.id);
      continue;
    }
    const toCustomer = !onPhone && (message.senderType === 'agent' || message.senderType === 'ai');
    if (toCustomer && message.sendStatus && !SEND_DONE.has(message.sendStatus)) continue;
    watched.seen.add(message.id);
    const text = displayText(message.contentText ?? '');
    let label: string;
    if (onPhone) {
      label = message.senderType === 'customer' ? 'You → Shopkeeper (phone)' : 'Shopkeeper → your phone';
      if (message.senderType !== 'customer') watched.phone.push({ at: message.sentAt, text });
    } else if (message.senderType === 'customer') {
      label = 'Customer → store';
    } else if (message.senderType === 'note') {
      label = 'Note on the ticket';
    } else {
      label = `Store → customer (${message.sendStatus ?? 'not sent'}${message.sendError ? `: ${message.sendError}` : ''})`;
    }
    console.log(`  ${since(message.sentAt.getTime())}  ${label}\n${indent(text)}`);
  }
}

async function waitFor<T>(
  what: string,
  organizationId: string,
  after: Date,
  check: () => Promise<T | null>,
): Promise<T> {
  const deadline = Date.now() + stepTimeoutMs;
  for (;;) {
    await printNewMessages(organizationId, after);
    const result = await check();
    if (result !== null) {
      await printNewMessages(organizationId, after);
      return result;
    }
    if (Date.now() > deadline) throw new Error(`Nothing after ${seconds(stepTimeoutMs)}: ${what}`);
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
  }
}

// ── Gateway calls ─────────────────────────────────────────────────────────────

function gatewayUrl(): string {
  const configured = values.gateway?.trim()
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');
  if (!configured) throw new Error('No gateway URL: pass --gateway https://… (RAILWAY_PUBLIC_DOMAIN is not set)');
  return configured.replace(/\/+$/, '');
}

/** One customer DM, signed the way SocialAPI signs it. */
async function sendCustomerDm(input: {
  secret: string;
  accountId: string;
  conversationId: string;
  senderId: string;
  text: string;
}): Promise<Date> {
  const receivedAt = new Date();
  const messageId = `simulated-${randomUUID()}`;
  const body = JSON.stringify({
    event: 'dm.received',
    data: {
      id: messageId,
      account_id: input.accountId,
      conversation_id: input.conversationId,
      platform: 'instagram',
      platform_id: messageId,
      author: { id: input.senderId },
      content: { text: input.text },
      received_at: receivedAt.toISOString(),
    },
  });
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const signature = createHmac('sha256', input.secret).update(`${timestamp}.${body}`).digest('hex');
  const response = await fetch(`${gatewayUrl()}/webhooks/socialapi`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-socialapi-event': 'dm.received',
      'x-socialapi-delivery': randomUUID(),
      'x-socialapi-timestamp': timestamp,
      'x-socialapi-signature-v2': `sha256=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`The gateway answered the webhook with ${response.status}`);
  return receivedAt;
}

async function callOperatorRoute<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${gatewayUrl()}/internal/operator/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' },
    body: JSON.stringify(payload),
    // Both routes re-plan or execute before they answer.
    signal: AbortSignal.timeout(stepTimeoutMs),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(`${path} answered ${response.status}: ${result.error ?? 'no detail'}`);
  return result;
}

// ── Setup reads ───────────────────────────────────────────────────────────────

interface ShopifyOrder {
  id: number;
  name: string;
  current_total_price: string;
  currency: string;
  cancelled_at: string | null;
  closed_at: string | null;
  refunds?: unknown[];
  shipping_address?: { zip?: string | null } | null;
}

async function lastCustomerMessageAt(conversation: SocialApiInstagramConversation): Promise<Date | null> {
  const client = createSocialApiClient({ apiKey: getSocialApiApiKey() ?? '' });
  let latest: Date | null = null;
  let cursor: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const result = await client.listConversationMessages({
      conversationId: conversation.id,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    if (!result.ok) throw new Error(`SocialAPI returned ${result.error.category} reading the conversation`);
    for (const message of result.data.data) {
      if (message.senderId !== conversation.participantId) continue;
      const at = new Date(message.createdAt);
      if (!latest || at > latest) latest = at;
    }
    if (!result.data.hasMore || !result.data.nextCursor) break;
    cursor = result.data.nextCursor;
  }
  return latest;
}

async function main(): Promise<void> {
  const workspace = values.workspace?.trim();
  const handle = values.instagram?.trim().replace(/^@/, '');
  const refundTiming = values['refund-timing']?.trim() || null;
  if (!workspace || !handle || !Number.isFinite(stepTimeoutMs) || stepTimeoutMs <= 0) {
    throw new Error(
      'Usage: --workspace <clerk_org_id or id> --instagram <test handle> '
      + '[--refund-timing "<refund timing>"] [--order #1051] [--gateway https://…] [--timeout 180] [--execute]',
    );
  }

  const organization = await db.organization.findFirst({
    where: { OR: [{ clerkOrgId: workspace }, ...(/^[0-9a-f-]{36}$/i.test(workspace) ? [{ id: workspace }] : [])] },
    select: { id: true, name: true, clerkOrgId: true, settings: true },
  });
  if (!organization) throw new Error(`No workspace ${workspace}`);
  console.log(`Workspace: ${organization.name} (${organization.clerkOrgId})\n`);
  const organizationId = organization.id;

  const setup = await step('Ready to run', async () => {
    const problems: string[] = [];
    const webhookSecret = process.env.SOCIALAPI_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) problems.push('SOCIALAPI_WEBHOOK_SECRET is not set');
    if (!process.env.INTERNAL_API_SECRET?.trim()) problems.push('INTERNAL_API_SECRET is not set');
    const gateway = (() => {
      try { return gatewayUrl(); } catch (error) { problems.push((error as Error).message); return null; }
    })();

    const settings = resolveAgentSettings(organization.settings);
    if (settings.autonomyTier === 'trusted') {
      problems.push('Trust level is trusted: the refund can run without a card. Set it to guarded for this test');
    }

    const binding = await db.orgMemberImessageBinding.findFirst({
      where: { orgMember: { organizationId } },
      orderBy: { createdAt: 'asc' },
      select: { orgMember: { select: { id: true, clerkUserId: true } } },
    });
    if (!binding) problems.push('No phone linked: the refund card has nowhere to go');

    const found = await findInstagramConversations(organizationId, handle);
    const conversation = found.ok ? found.conversations[0] : undefined;
    if (!found.ok) problems.push(`Could not look up ${handle} in SocialAPI: ${found.reason}`);
    else if (!conversation) problems.push(`SocialAPI has no conversation with ${handle}. Send the store a DM from ${handle} first`);
    const lastMessageAt = conversation ? await lastCustomerMessageAt(conversation) : null;
    if (conversation && (!lastMessageAt || Date.now() - lastMessageAt.getTime() > REPLY_WINDOW_MS)) {
      problems.push(
        `Instagram only lets the store reply within 24 hours of ${handle}'s last message`
        + `${lastMessageAt ? ` (last one ${lastMessageAt.toISOString()})` : ''}. `
        + `Send the store any DM from ${handle}, then run this again`,
      );
    }

    const shopify = await db.integration.findFirst({
      where: { organizationId, platform: 'shopify', lifecycleStatus: 'active' },
      select: { externalAccountId: true, accessToken: true },
    });
    let order: ShopifyOrder | undefined;
    if (!shopify?.accessToken) {
      problems.push('Shopify is not connected');
    } else {
      const wanted = values.order?.trim().replace(/^#?/, '#');
      const { orders = [] } = await shopifyRestJson<{ orders?: ShopifyOrder[] }>(
        { shop: shopify.externalAccountId, accessToken: shopify.accessToken },
        'orders.json',
        {
          query: {
            ...(wanted ? { name: wanted, status: 'any' } : { financial_status: 'paid', status: 'open', limit: 50 }),
            fields: 'id,name,current_total_price,currency,cancelled_at,closed_at,refunds,shipping_address',
          },
        },
      );
      const limit = settings.maxRefundAmount;
      const eligible = orders.filter(candidate => (
        (!wanted || candidate.name === wanted)
        && !candidate.cancelled_at
        && !candidate.closed_at
        && (candidate.refunds?.length ?? 0) === 0
        && (limit === null || Number(candidate.current_total_price) <= limit)
        && Boolean(candidate.shipping_address?.zip)
      ));
      order = eligible[0];
      if (!order) {
        problems.push(wanted
          ? `${wanted} is not an open, unrefunded order under the ${limit ?? 'compensation'} limit with a shipping zip`
          : `No open, paid, unrefunded order under the ${limit ?? 'compensation'} limit has a shipping zip`);
      }
    }

    if (problems.length > 0) throw new Error(problems.join('\n'));
    console.log([
      `        Gateway        ${gateway}`,
      `        Customer       ${handle} (sender ${conversation!.participantId}), last message ${lastMessageAt!.toISOString()}`,
      `        Order          ${order!.name}  ${order!.current_total_price} ${order!.currency}  zip ${order!.shipping_address!.zip}`,
      `        Refund timing  ${refundTiming ? `"${refundTiming}" if the card asks (the script answers it, so don't reply on your phone)` : 'not given: answer on your phone if the card asks'}`,
    ].join('\n'));
    return {
      webhookSecret: webhookSecret!,
      accountId: found.ok ? found.accountId : '',
      conversation: conversation!,
      member: binding!.orgMember,
      shopify: { shop: shopify!.externalAccountId, accessToken: shopify!.accessToken! },
      order: order!,
    };
  });

  if (!values.execute) {
    console.log('\nDry run. Add --execute to reset the test customer and run the refund (a real refund on the store).');
    return;
  }

  const { conversation, member, order } = setup;
  const senderId = conversation.participantId;
  const memberKey = memberOperatorKey(member.id);
  const zip = order.shipping_address!.zip!;
  const runStart = new Date();

  await step(`Reset ${handle}`, async () => {
    const customers = await db.customer.findMany({
      where: {
        organizationId,
        threads: { some: { channelType: 'ig_dm' } },
        OR: [{ platformId: senderId }, { name: { equals: handle, mode: 'insensitive' } }],
      },
      select: { id: true },
    });
    const erased = await eraseCustomers(organizationId, customers.map(customer => customer.id));
    console.log(`        Erased ${erased.customerIds.length} customer(s), ${erased.threadIds.length} conversation(s)`);
  });

  watched.memberKey = memberKey;

  const readContext = async () => {
    const context = await db.operatorContext.findUnique({
      where: { organizationId_memberKey: { organizationId, memberKey } },
      select: { pendingPlans: true, pendingQuestion: true },
    });
    return {
      plan: readPendingPlanArray(context?.pendingPlans).find(plan => plan.threadId === watched.ticketId) ?? null,
      question: (() => {
        const question = readPendingQuestion(context?.pendingQuestion);
        return question?.threadId === watched.ticketId ? question : null;
      })(),
    };
  };
  const readTicket = () => db.thread.findUnique({
    where: { id: watched.ticketId! },
    select: { status: true, escalatedAt: true, customerId: true },
  });
  const customerSends = (after: Date) => db.message.findMany({
    where: {
      organizationId, threadId: watched.ticketId!, deletedAt: null,
      senderType: { in: ['agent', 'ai'] }, sentAt: { gt: after },
    },
    orderBy: { sentAt: 'asc' },
    select: { sendStatus: true, sendError: true, sentAt: true },
  });
  const lastPhoneMessage = () => watched.phone.at(-1)?.text ?? '(nothing reached the phone)';
  const handedOff = async () => {
    const ticket = await readTicket();
    if (!ticket?.escalatedAt) return null;
    // The handoff reaches the phone a few seconds after the ticket is escalated.
    const texted = watched.phone.some(message => message.at >= ticket.escalatedAt!);
    if (!texted && Date.now() - ticket.escalatedAt.getTime() < 30_000) return null;
    return `The agent handed the ticket to you instead. Phone:\n${lastPhoneMessage()}`;
  };

  const refundRequest = `I changed my mind, I'd like a full refund on order ${order.name}`;
  const firstDmAt = await step('Customer asks for a refund', () => sendCustomerDm({
    secret: setup.webhookSecret, accountId: setup.accountId, conversationId: conversation.id, senderId, text: refundRequest,
  }));

  await step('Agent asks the customer to confirm the order', () => waitFor('no confirmation ask reached Instagram', organizationId, runStart, async () => {
    if (!watched.ticketId) {
      watched.ticketId = (await db.thread.findFirst({
        where: { organizationId, channelType: 'ig_dm', customer: { platformId: senderId } },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      }))?.id ?? null;
      if (!watched.ticketId) return null;
    }
    const sends = await customerSends(firstDmAt);
    const failed = sends.find(send => send.sendStatus && send.sendStatus !== 'sent' && SEND_DONE.has(send.sendStatus));
    if (failed) throw new Error(`The reply was not delivered (${failed.sendStatus}): ${failed.sendError ?? 'no detail'}`);
    const handoff = await handedOff();
    if (handoff) throw new Error(handoff);
    const { plan } = await readContext();
    if (plan) throw new Error('The agent drafted a card without confirming the order first');
    const ticket = await readTicket();
    // The ask is recorded just before the message carrying it is sent.
    const asked = await db.orderVerification.findFirst({
      where: { organizationId, customerId: ticket!.customerId, threadId: watched.ticketId, verifiedAt: null },
      select: { requestedAt: true },
    });
    return asked && sends.some(send => send.sendStatus === 'sent' && send.sentAt >= asked.requestedAt) ? true : null;
  }));

  const zipSentAt = await step(`Customer answers with the zip (${zip})`, () => sendCustomerDm({
    secret: setup.webhookSecret, accountId: setup.accountId, conversationId: conversation.id, senderId, text: zip,
  }));

  await step('Order confirmed', () => waitFor('the zip was not compared with the order', organizationId, runStart, async () => {
    const ticket = await readTicket();
    const verification = await db.orderVerification.findFirst({
      where: { organizationId, customerId: ticket!.customerId },
      orderBy: { updatedAt: 'desc' },
      select: { verifiedAt: true, attempts: true },
    });
    if (verification?.verifiedAt) return true;
    if (verification && verification.attempts > 0) throw new Error(`The zip ${zip} did not match ${order.name}`);
    return null;
  }));

  let cardAfter = zipSentAt;
  const waitForCardOrQuestion = (what: string) => waitFor(what, organizationId, runStart, async () => {
    const handoff = await handedOff();
    if (handoff) throw new Error(handoff);
    const context = await readContext();
    // A card or question is parked before it is sent and mirrored once sent, so
    // nothing is answered or approved before the phone shows it.
    const cardSent = watched.phone.some(message => message.at > cardAfter);
    if (!cardSent) return null;
    if (context.question) return { question: context.question.question, plan: null };
    return context.plan ? { question: null, plan: context.plan } : null;
  });

  let next = await step('A card or a question reaches your phone', () => (
    waitForCardOrQuestion('no refund card or question reached the phone')
  ));
  if (next.question) {
    const question = next.question;
    cardAfter = new Date();
    if (refundTiming) {
      await step('Answer the question and save it to Memory', async () => {
        console.log(`        Asked: ${question}\n        Answer: ${refundTiming}`);
        const result = await callOperatorRoute<{ status: string; message: string }>('answer', {
          organizationId, clerkUserId: member.clerkUserId, threadId: watched.ticketId, answer: refundTiming, saveToKb: true,
        });
        if (result.status !== 'replanned') throw new Error(`The answer did not re-draft the card: ${result.message}`);
      });
    } else {
      console.log(`\nThe agent asked you on your phone:\n${indent(question)}\nAnswer it there; waiting up to ${seconds(stepTimeoutMs)}.\n`);
    }
    next = await step('The refund card follows the answer', async () => {
      const after = await waitForCardOrQuestion('no refund card reached the phone after the answer');
      if (after.question) throw new Error(`The agent asked again instead of drafting the refund:\n${after.question}`);
      return after;
    });
  }

  const plan = await step('The card is the refund, ready to approve', async () => {
    const parked = next.plan as PendingPlan;
    console.log(`        Card:\n${indent(indent(lastPhoneMessage()))}`);
    if (parked.validation?.status === 'invalid') throw new Error('The card failed validation and cannot be approved');
    if (!parked.rawToolCalls.some(call => REFUND_TOOLS.has(call.name))) {
      throw new Error(`The card has no refund: ${parked.rawToolCalls.map(call => call.name).join(', ') || 'no actions'}`);
    }
    if (!parked.planId) throw new Error('The card has no plan id to approve');
    for (const [name, answer] of Object.entries(blankAnswersInCalls(parked.rawToolCalls))) {
      console.log(`        ${name} filled from Memory: ${answer}`);
    }
    return parked;
  });

  // A card that leaves the refund timing blank is approved by answering it.
  const blanks = merchantAnswerSlotsInCalls(plan.rawToolCalls);
  const approvedAt = new Date();
  if (blanks.length > 0 && !refundTiming) {
    console.log(`\nThe card asks you on your phone:\n${indent(blanks.map(blank => blank.question).join(' '))}\nAnswer it there; waiting up to ${seconds(stepTimeoutMs)}.\n`);
  } else {
    await step(blanks.length > 0 ? 'Approve the refund by answering the card' : 'Approve the refund', async () => {
      if (blanks.length > 0) console.log(`        Answer: ${refundTiming}`);
      const { summary } = await callOperatorRoute<{ summary: string }>('plan-decision', {
        organizationId, clerkUserId: member.clerkUserId, planId: plan.planId, decision: 'approve',
        ...(blanks.length > 0 ? { merchantAnswers: Object.fromEntries(blanks.map(blank => [blank.name, refundTiming])) } : {}),
      });
      console.log(`        Phone reply: ${summary}`);
    });
  }

  // The reply goes out only once the refund succeeded, so it is waited for first.
  await step('Reply reaches the customer on Instagram', () => waitFor('the reply was not sent', organizationId, runStart, async () => {
    const sends = await customerSends(approvedAt);
    const done = sends.find(send => send.sendStatus && SEND_DONE.has(send.sendStatus));
    if (!done) return null;
    if (done.sendStatus !== 'sent') throw new Error(`The reply was not delivered (${done.sendStatus}): ${done.sendError ?? 'no detail'}`);
    return true;
  }));

  await step(`Refund recorded in Shopify on ${order.name}`, async () => {
    const { refunds = [] } = await shopifyRestJson<{
      refunds?: Array<{ created_at: string; transactions?: Array<{ amount: string; kind: string; status: string }> }>;
    }>(setup.shopify, `orders/${order.id}/refunds.json`);
    const made = refunds.filter(refund => new Date(refund.created_at).getTime() >= runStart.getTime() - 60_000);
    if (made.length === 0) throw new Error(`Shopify shows no refund on ${order.name} from this run`);
    const amount = made
      .flatMap(refund => refund.transactions ?? [])
      .filter(transaction => transaction.kind === 'refund' && transaction.status === 'success')
      .reduce((total, transaction) => total + Number(transaction.amount), 0);
    console.log(`        Refunded ${amount.toFixed(2)} ${order.currency} of ${order.current_total_price}`);
  });

  if (blanks.length > 0) {
    await step('Refund timing saved to Memory', async () => {
      const saved = await db.kbArticle.findFirst({
        where: { organizationId, updatedAt: { gte: approvedAt } },
        orderBy: { updatedAt: 'desc' },
        select: { title: true },
      });
      if (!saved) throw new Error('No Memory entry was written with the answer');
      console.log(`        ${saved.title}`);
    });
  }
}

async function printTimings(): Promise<void> {
  const timings = await db.stepTiming.findMany({
    where: { threadId: watched.ticketId! },
    orderBy: { startedAt: 'asc' },
    select: { step: true, detail: true, durationMs: true },
  });
  if (timings.length === 0) return;
  const byStep = new Map<string, { count: number; total: number; longest: number }>();
  for (const timing of timings) {
    const key = timing.detail ? `${timing.step} (${timing.detail})` : timing.step;
    const entry = byStep.get(key) ?? { count: 0, total: 0, longest: 0 };
    entry.count += 1;
    entry.total += timing.durationMs;
    entry.longest = Math.max(entry.longest, timing.durationMs);
    byStep.set(key, entry);
  }
  console.log('\nTimings recorded on the ticket (count, total, longest):');
  for (const [key, entry] of byStep) {
    console.log(`  ${key.padEnd(44)} ${String(entry.count).padStart(3)}  ${seconds(entry.total).padStart(7)}  ${seconds(entry.longest).padStart(7)}`);
  }
}

main()
  .catch((error: unknown) => {
    if (!(error instanceof StepFailed)) console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (watched.ticketId) {
      await printTimings();
      console.log(`\nTicket: ${watched.ticketId}`);
    }
    const failed = steps.filter(entry => !entry.ok);
    if (process.exitCode !== 1 && values.execute) {
      console.log(`\nAll ${steps.length} steps passed in ${seconds(Date.now() - runStartedAt)}.`);
    } else if (failed.length > 0) {
      console.log(`\nFailed: ${failed.map(entry => entry.name).join('; ')}.`);
    }
    await db.$disconnect();
  });
