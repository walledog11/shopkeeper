import { db, Prisma } from "@shopkeeper/db";
import { parseClassifierSignals } from "./classifier-signals.js";
import { usesCapabilityDiscovery } from "./runtime-modes.js";
import { shopifyRestJson, type ShopifyContext } from "./shopify/client.js";
import { recordedShopifyScopes } from "./shopify/integration-health.js";
import { CHANNEL_TYPE, isOperatorChannel } from "./thread-constants.js";
import { MEMORY_OVERRIDE_TAG, memoryOverrideTargetIds } from "./kb-memory.js";
import {
  budgetMerchantPreferences,
  loadActiveMerchantPreferences,
} from "./merchant-preferences.js";
import {
  hydrateAgentMessageImages,
  shouldHydrateAgentMessageImages,
} from "./image-attachments.js";
import logger from "./logger.js";
import {
  CONTEXT_BUDGETS,
  budgetKbArticles,
  budgetRecentMessages,
  truncateContextText,
} from "./context-budget.js";
import type { ToolResult } from "./tools/result.js";
import type {
  AddInternalNoteInput,
  AskOperatorInput,
  SendReplyInput,
  SendEmailInput,
  UpdateThreadStatusInput,
  UpdateThreadTagInput,
  EscalateToHumanInput,
} from "./tools/registry/index.js";
import type {
  AgentActionMode,
  AgentContext,
  AgentExecutionIdentity,
  AgentRecentMessage,
  BaseAgentContext,
  ShopifyOrderSummary,
} from "./agent-context.js";

// Where a thread-coupled tool delivers. Support injects the dashboard messaging
// stack (Postmark/IG/email) here; the package itself never imports a provider.
// `escalate` and `io` on the built context are wired from these, bound to the
// thread's identity.
interface ThreadSinkContext {
  agentActionMode?: AgentActionMode;
  threadId: string;
  orgId: string;
  orgName: string;
  operationId?: string;
  executionId?: string;
  agentRequestId?: string;
  agentTaskId?: string;
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

type RawShopifyOrder = {
  id: number;
  name: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  current_total_price: string;
  currency?: string | null;
  line_items: {
    id?: number | string;
    title: string;
    quantity: number;
    fulfillable_quantity?: number;
    current_quantity?: number;
    fulfillment_status?: string | null;
    variant_id: number | string | null;
  }[];
  shipping_address?: {
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    province?: string | null;
    zip?: string | null;
    country?: string | null;
    country_name?: string | null;
  } | null;
};

/**
 * A context load that must not fail the turn, declared at the load rather than
 * around the assembly.
 *
 * `buildContext` reads three tiers of dependency and they have to fail
 * differently:
 *
 * - **Identity and policy** — the thread, the organization, the Shopify
 *   integration, the storefront verification rows. The turn cannot be
 *   authorized without them, so they are awaited directly and a failure throws.
 *   Degrading a failed integration read to `shopify: null` would have the agent
 *   tell a customer the store is disconnected and turn every dependent write
 *   into "no Shopify integration connected"; degrading a failed verification
 *   read would answer a shopper who proved control of their order as a guest.
 * - **Operation evidence** — recent orders, knowledge-base articles. Unrelated
 *   work continues without them, but the plan carries a typed signal so the
 *   merchant is never shown a reply written as though the evidence was there.
 * - **Conversational context** — the open-thread count, merchant preferences,
 *   the linked Shopify name, hydrated message images. Nothing depends on them,
 *   so the neutral value stands and the failure is logged.
 *
 * One wrapper per load, deliberately, and not one around the whole assembly: a
 * single catch-and-continue cannot say which tier failed, and it is the tier
 * that decides whether the turn may proceed. What hid the missing
 * merchant-preference table for a day was an uncaught fan-out inside
 * `Promise.all`, so every non-fatal load here names itself.
 */
async function loadNonFatalContext<T>(
  label: string,
  scope: { orgId: string; threadId: string },
  fallback: T,
  load: () => Promise<T>,
): Promise<{ value: T; failed: boolean }> {
  try {
    return { value: await load(), failed: false };
  } catch (error) {
    logger.warn(
      { ...scope, contextLoad: label, err: error },
      "[agent:context] non-fatal context load failed",
    );
    return { value: fallback, failed: true };
  }
}

/**
 * Whether this turn's knowledge base has to be pre-loaded, or can be left to
 * `search_kb` if the model turns out to need it.
 *
 * The pre-fetch is the largest variable input in the support prompt — up to
 * `kbTotalChars`, more than the entire starter tool set — and a "where is my
 * order" question has never needed it. So on the discovery runtime one
 * classification is answered on demand: `order_status` and nothing else, where
 * the classifier was confident, aligned, and named no policy question, no
 * mutation and no risk. Everything else, including every classification the
 * planner could not use, still pre-loads; not knowing what a turn needs is a
 * reason to carry the evidence, not to drop it.
 *
 * The model keeps `search_kb` in every one of these sets, and the prompt already
 * tells it that nothing is pre-loaded, so the capability is deferred rather than
 * removed.
 */
function prefetchesKnowledgeBase(
  signals: ReturnType<typeof parseClassifierSignals>,
  requestSourceMessageId: string | null,
  latestCustomerMessageId: string | null,
): boolean {
  if (!usesCapabilityDiscovery()) return true;
  if (!signals) return true;
  // Same alignment rule tool selection narrows on: a classification taken from
  // an older message is not evidence about this one.
  if (!requestSourceMessageId || requestSourceMessageId !== latestCustomerMessageId) return true;
  const { intents } = signals;
  if (!intents.order_status) return true;
  return KB_DEPENDENT_INTENTS.some((intent) => intents[intent]);
}

// Every intent whose turn may need documented policy. Listed rather than
// inverted so a new intent defaults to pre-loading instead of silently
// inheriting the deferral.
const KB_DEPENDENT_INTENTS = [
  "policy_question",
  "mutative_request",
  "fraud_signals",
  "contradiction",
  "out_of_scope_commercial",
  "forwarded_injection",
  "no_request",
] as const;

export interface BuildContextOptions {
  agentActionMode?: AgentActionMode;
  pinKbArticles?: readonly { title: string; body: string }[];
  // Operator/read-only callers only use the last few messages, so they can cap
  // the fetch here instead of loading 50 rows and slicing after. Defaults to 50.
  messageWindow?: number;
  // Operator channel only: host-rendered pending-state ledger. Copied verbatim
  // onto the context and surfaced in the operator prompt; opaque to the core.
  operatorLedger?: string;
  // Dashboard Concierge only: navigation tools and prompt guidance apply.
  operatorDeskMode?: boolean;
}

function mergePinnedKbArticles(
  pinned: readonly { title: string; body: string }[],
  loaded: readonly { title: string; body: string; tags: string[] }[],
): { title: string; body: string; tags: string[] }[] {
  const seenTitles = new Set<string>();
  const merged: { title: string; body: string; tags: string[] }[] = [];

  for (const article of pinned) {
    const key = article.title.trim().toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    merged.push({ title: article.title, body: article.body, tags: [] });
  }

  for (const article of loaded) {
    const key = article.title.trim().toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    merged.push(article);
  }

  const limit = Math.max(3, pinned.length);
  return merged.slice(0, limit);
}

export async function buildContext(
  threadId: string,
  orgId: string,
  sink: ThreadSink,
  options?: BuildContextOptions,
): Promise<AgentContext> {
  const requestedMessageWindow = options?.messageWindow ?? 50;
  const fetchedMessageWindow = Math.min(requestedMessageWindow, CONTEXT_BUDGETS.recentMessageCount);
  const scope = { orgId, threadId };
  const activeMerchantPreferencesPromise = loadNonFatalContext(
    "merchant_preferences",
    scope,
    [] as Awaited<ReturnType<typeof loadActiveMerchantPreferences>>,
    () => loadActiveMerchantPreferences(orgId),
  );

  // Identity and policy. Awaited together and uncaught on purpose: every one of
  // these decides whether the turn may act at all.
  const [thread, org, shopifyIntegration, activeMerchantPreferences] = await Promise.all([
    db.thread.findUnique({
      where: { id: threadId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            platformId: true,
          },
        },
        messages: { orderBy: { sentAt: "desc" }, take: fetchedMessageWindow },
      },
    }),
    db.organization.findUnique({ where: { id: orgId } }),
    db.integration.findFirst({ where: { organizationId: orgId, platform: "shopify", lifecycleStatus: "active" } }),
    activeMerchantPreferencesPromise,
  ]);

  if (!thread || thread.organizationId !== orgId) {
    throw new Error("Thread not found");
  }

  const classifierSignals = parseClassifierSignals(thread.classifierSignals);
  const prefetchKb = prefetchesKnowledgeBase(
    classifierSignals,
    thread.requestSourceMessageId,
    thread.messages.find((message) => message.senderType === "customer")?.id ?? null,
  );

  // Operation evidence. Rank matching tags before the limit, so newer unrelated
  // articles cannot displace the relevant policy. Exclude overridden memories
  // before ranking.
  const loadEffectiveKbArticles = () => loadNonFatalContext(
    "kb_articles",
    scope,
    [] as Array<{ title: string; body: string; tags: string[] }>,
    async () => {
      const overrides = await db.kbArticle.findMany({
        where: { organizationId: orgId, tags: { has: MEMORY_OVERRIDE_TAG } },
        select: { tags: true },
      });
      const overriddenIds = memoryOverrideTargetIds(overrides);
      return db.$queryRaw<Array<{ title: string; body: string; tags: string[] }>>(Prisma.sql`
        SELECT title, body, tags FROM kb_articles
        WHERE organization_id = ${orgId}::uuid
        ${overriddenIds.length ? Prisma.sql`AND id NOT IN (${Prisma.join(overriddenIds.map(id => Prisma.sql`${id}::uuid`))})` : Prisma.empty}
        ORDER BY EXISTS (SELECT 1 FROM unnest(tags) AS tag WHERE lower(tag) = ${thread.tag?.toLowerCase() ?? null}) DESC,
          updated_at DESC, id DESC
        LIMIT 3
      `);
    },
  );
  const effectiveKbArticlesPromise = prefetchKb
    ? loadEffectiveKbArticles()
    : Promise.resolve({ value: [] as Array<{ title: string; body: string; tags: string[] }>, failed: false });

  // Conversational context. One open thread is the neutral answer — this one —
  // so a failed count reads as "nothing else is open" rather than suppressing
  // the turn over a number the prompt only mentions in passing.
  const openThreadCountPromise = loadNonFatalContext(
    "open_thread_count",
    scope,
    1,
    () => db.thread.count({
      where: { organizationId: orgId, customerId: thread.customerId, status: "open" },
    }),
  );

  const dbName = thread.customer.name?.includes("@") ? null : (thread.customer.name ?? null);

  let shopifyCustomerId = thread.shopifyCustomerId;
  let shopifyCustomerName: string | null = null;
  if (!shopifyCustomerId && thread.channelType === "email" && shopifyIntegration?.accessToken) {
    try {
      const email = thread.customer.platformId;
      const data = await shopifyRestJson<{ customers?: { id: number; first_name?: string | null; last_name?: string | null }[] }>(
        { shop: shopifyIntegration.externalAccountId, accessToken: shopifyIntegration.accessToken },
        "customers/search.json",
        { query: { query: `email:${email}`, fields: "id,first_name,last_name", limit: 1 } }
      );
      const found = data.customers?.[0];
      if (found?.id) {
        shopifyCustomerId = String(found.id);
        const parts = [found.first_name, found.last_name].filter(Boolean);
        if (parts.length > 0) shopifyCustomerName = parts.join(" ");
        await db.thread.update({
          where: { id: thread.id },
          data: { shopifyCustomerId },
        }).catch(() => {});
      }
    } catch {
      // Best effort; leave the thread unlinked.
    }
  }

  const isOperator = isOperatorChannel(thread.channelType);
  const isGatewayOperator = thread.channelType === "operator";
  // The single place a conversation becomes a guest. Storefront chat is the only
  // channel whose sender is anonymous by construction: every other channel
  // carries an identity the merchant's provider already established.
  const isStorefront = thread.channelType === CHANNEL_TYPE.SHOPIFY_CHAT;

  // A storefront session is promoted out of guest only by rows this process did
  // not write: the challenge is issued and answered by the host's verification
  // route, outside the agent entirely. Reading the result here — rather than
  // letting a tool establish it — is what keeps identity off the model's list of
  // things it can decide, and keeps the ritual out of the approval loop.
  //
  // Resolved through the session's episode history rather than its current
  // `threadId`. That pointer moves on episode rollover, so keying off it made
  // verification a side effect of a pointer update in both directions: the new
  // episode silently inherited it, and the expired episode silently lost it —
  // so a late merchant reply or an operator replan on the old thread would run
  // under guest policy. Scope now follows the proof: the browser session that
  // answered the challenge, for as long as that session lives.
  const verifiedOrders = isStorefront
    ? (await db.storefrontChatVerification.findMany({
        where: {
          organizationId: orgId,
          verifiedAt: { not: null },
          session: { revokedAt: null, episodes: { some: { threadId: thread.id } } },
        },
        select: { orderName: true, orderId: true },
      }))
    : [];
  const isGuest = isStorefront && verifiedOrders.length === 0;
  const isVerified = isStorefront && verifiedOrders.length > 0;

  let recentOrders: ShopifyOrderSummary[] = [];
  let recentOrdersFetchFailed = false;
  if (shopifyCustomerId && shopifyIntegration?.accessToken) {
    const ctx: ShopifyContext = { shop: shopifyIntegration.externalAccountId, accessToken: shopifyIntegration.accessToken };

    const nameFetch = (!shopifyCustomerName && (isOperator || !dbName))
      ? shopifyRestJson<{ customer?: { first_name?: string | null; last_name?: string | null } }>(
          ctx,
          `customers/${shopifyCustomerId}.json`,
          { query: { fields: "first_name,last_name" } }
        ).catch(() => null)
      : Promise.resolve(null);

    const ordersFetch = shopifyRestJson<{ orders?: RawShopifyOrder[] }>(
      ctx,
      "orders.json",
      {
        query: {
          customer_id: shopifyCustomerId,
          status: "any",
          limit: 5,
          fields: "id,name,created_at,financial_status,fulfillment_status,current_total_price,currency,line_items,shipping_address",
        },
      }
    ).catch((error) => {
      recentOrdersFetchFailed = true;
      logger.warn({
        orgId,
        threadId: thread.id,
        shopifyCustomerId,
        err: error,
      }, "[agent:context] recent orders pre-fetch failed");
      return null;
    });

    const [nameData, ordersData] = await Promise.all([nameFetch, ordersFetch]);

    if (nameData) {
      const parts = [nameData.customer?.first_name, nameData.customer?.last_name].filter(Boolean);
      if (parts.length > 0) shopifyCustomerName = parts.join(" ");
    }

    if (ordersData?.orders) {
      recentOrders = ordersData.orders.map((o) => ({
        id: String(o.id),
        name: o.name,
        created_at: o.created_at,
        financial_status: o.financial_status,
        fulfillment_status: o.fulfillment_status,
        total_price: o.current_total_price,
        currency: o.currency ?? null,
        items: o.line_items.map((li) => ({
          line_item_id: li.id !== undefined && li.id !== null ? String(li.id) : null,
          title: li.title,
          quantity: li.quantity,
          fulfillable_quantity: li.fulfillable_quantity ?? null,
          current_quantity: li.current_quantity ?? null,
          fulfillment_status: li.fulfillment_status ?? null,
          variant_id: li.variant_id ? String(li.variant_id) : null,
        })),
        shipping_address: o.shipping_address
          ? {
              address1: o.shipping_address.address1 ?? null,
              address2: o.shipping_address.address2 ?? null,
              city: o.shipping_address.city ?? null,
              province: o.shipping_address.province ?? null,
              zip: o.shipping_address.zip ?? null,
              country: o.shipping_address.country_name ?? o.shipping_address.country ?? null,
            }
          : null,
      }));
    }
  }

  const openThreadCount = (await openThreadCountPromise).value;

  const kbResult = await effectiveKbArticlesPromise;
  const allKbArticles = kbResult.value;
  const threadTag = thread.tag?.toLowerCase();
  const matchingKbArticles = threadTag
    ? allKbArticles.filter(a => a.tags.some(t => t.toLowerCase() === threadTag))
    : allKbArticles;
  const loadedKbArticles = matchingKbArticles.length > 0 ? matchingKbArticles : allKbArticles;
  const mergedKbArticles = options?.pinKbArticles?.length
    ? mergePinnedKbArticles(options.pinKbArticles, loadedKbArticles)
    : loadedKbArticles;
  const budgetedKb = budgetKbArticles(mergedKbArticles);
  const kbArticles = budgetedKb.articles;
  const budgetedPreferences = budgetMerchantPreferences(activeMerchantPreferences.value);
  const merchantPreferences = budgetedPreferences.preferences;

  const threadIo = {
    threadId: thread.id,
    orgId,
    orgName: org?.name ?? "Support",
    ...(options?.agentActionMode
      ? { agentActionMode: options.agentActionMode }
      : {}),
  };

  const rawRecentMessages = [...thread.messages].reverse().map((message) => ({
    senderType: message.senderType,
    contentText: message.contentText,
    attachmentRefs: message.attachments,
  }));
  const budgetedMessages = budgetRecentMessages(rawRecentMessages, {
    maxCount: fetchedMessageWindow,
  });
  const contextMessages = budgetedMessages.messages;
  const strippedMessages = (): AgentRecentMessage[] => contextMessages.map(
    ({ senderType, contentText }) => ({ senderType, contentText }),
  );
  // Conversational context: an unreachable attachment costs the model the
  // picture, never the conversation, so the text of the same messages stands.
  const recentMessages = shouldHydrateAgentMessageImages(thread.channelType)
    ? (await loadNonFatalContext(
        "message_images",
        scope,
        strippedMessages(),
        () => hydrateAgentMessageImages(orgId, contextMessages),
      )).value
    : strippedMessages();
  logger.info({
    orgId,
    threadId,
    recentMessages: budgetedMessages.stats,
    kbArticles: budgetedKb.stats,
    merchantPreferences: budgetedPreferences.stats,
  }, "[agent:context] budget");

  const base: BaseAgentContext = {
    orgId,
    orgName: org?.name ?? "Support",
    recentMessages,
    shopify:
      shopifyIntegration?.accessToken
        ? {
            shop: shopifyIntegration.externalAccountId,
            accessToken: shopifyIntegration.accessToken,
            grantedScopes: recordedShopifyScopes(shopifyIntegration.metadata) ?? [],
          }
        : null,
    // The merchant is already the human in an operator conversation. Keep a
    // defensive no-side-effect sink even though operator turns hide the
    // escalation tool; this prevents a stray/direct call from parking the
    // durable operator thread and notifying the same merchant circularly.
    escalate: isGatewayOperator
      ? async () => {}
      : (reason) => sink.escalateToHuman({ reason }, threadIo).then(() => {}),
    askOperator: (question) =>
      sink.askOperator({ question }, threadIo).then(() => {}),
    io: {
      addInternalNote: (input, execution?: AgentExecutionIdentity) => sink.addInternalNote(input, { ...threadIo, ...execution }),
      sendReply: (input, execution?: AgentExecutionIdentity) => sink.sendReply(input, { ...threadIo, ...execution }),
      sendEmail: (input, execution?: AgentExecutionIdentity) => sink.sendEmail(input, { ...threadIo, ...execution }),
      updateThreadStatus: (input, execution?: AgentExecutionIdentity) => sink.updateThreadStatus(input, { ...threadIo, ...execution }),
      updateThreadTag: (input, execution?: AgentExecutionIdentity) => sink.updateThreadTag(input, { ...threadIo, ...execution }),
    },
  };

  return {
    ...base,
    ...(isGuest ? { authState: "guest" as const } : {}),
    ...(isVerified ? { authState: "verified" as const, verifiedOrders } : {}),
    thread: {
      id: thread.id,
      status: thread.status,
      channelType: thread.channelType,
      tag: thread.tag,
      aiSummary: thread.aiSummary
        ? truncateContextText(thread.aiSummary, CONTEXT_BUDGETS.priorSummaryChars)
        : thread.aiSummary,
      shopifyCustomerId,
      requestSourceMessageId: thread.requestSourceMessageId,
      latestCustomerMessageId: thread.messages.find((message) => message.senderType === "customer")?.id ?? null,
    },
    customer: {
      id: thread.customer.id,
      name: dbName ?? shopifyCustomerName,
      platformId: thread.customer.platformId,
    },
    openThreadCount,
    recentOrders,
    ...(recentOrdersFetchFailed ? { recentOrdersFetchFailed: true } : {}),
    ...(kbResult.failed ? { kbFetchFailed: true } : {}),
    linkedShopifyCustomerName: isOperator ? shopifyCustomerName : null,
    kbArticles: kbArticles.map(a => ({ title: a.title, body: a.body })),
    merchantPreferences,
    classifierSignals,
    ...(options?.operatorLedger
      ? {
          operatorLedger: truncateContextText(
            options.operatorLedger,
            CONTEXT_BUDGETS.operatorLedgerChars,
          ),
        }
      : {}),
    ...(options?.operatorDeskMode ? { operatorDeskMode: true } : {}),
  };
}
