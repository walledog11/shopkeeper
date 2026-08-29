import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

// Where an agent turn's opening tokens actually go, section by section.
//
// Uses `messages.count_tokens`, which is stateless and generates nothing, so
// this is a measurement rather than a run — it costs no output tokens and does
// not touch the org's spend cap.
//
//   ORG_ID=<uuid> railway run npx tsx apps/gateway/src/scripts/measure-agent-prompt.ts
//   ORG_ID=<uuid> CHANNEL=email ...   (the support prompt, a different shape)
//
// The split that matters is stable vs volatile. `buildSplitCachedSystemPrompt`
// caches the stable block at 1h TTL and the volatile block at 5m. Render order
// is tools -> system -> messages, so the FIRST breakpoint (end of stable) covers
// the tool definitions too. Against TOKEN_BUDGET, a 1h write is exempt and a 5m
// write counts at 1.25x — so the volatile block is what a sporadic operator pays
// for again and again, five minutes apart.

async function main() {
  const { db } = await import('@shopkeeper/db');
  const { anthropic, SONNET_MODEL } = await import('@shopkeeper/agent/ai');
  const { buildSystemPromptParts } = await import('@shopkeeper/agent/prompt');
  const { buildContext } = await import('@shopkeeper/agent/build-context');
  const { resolveAgentSettings } = await import('@shopkeeper/agent/settings');
  const { buildOperatorShopTools } = await import('../message-handlers/operator-shop-tools.js');
  const { buildOperatorInboxTools } = await import('../message-handlers/operator-inbox-tools.js');
  const { buildOperatorProductHelpTools } = await import('../message-handlers/operator-product-help-tools.js');
  const { gatewayThreadSink } = await import('../message-handlers/agent-thread-sink.js');
  const { buildMessageHistory } = await import('@shopkeeper/agent/message-history');

  const orgId = process.env.ORG_ID?.trim();
  if (!orgId) {
    console.error('Set ORG_ID.');
    process.exit(1);
  }

  // Operator by default; CHANNEL=email measures the support prompt, which is a
  // different and much larger shape — KB articles, customer history, orders.
  const channel = (process.env.CHANNEL?.trim() ?? 'sms_agent') as 'sms_agent' | 'email';
  const thread = process.env.THREAD_ID?.trim()
    ? await db.thread.findUnique({ where: { id: process.env.THREAD_ID.trim() }, select: { id: true } })
    : await db.thread.findFirst({
      where: { organizationId: orgId, channelType: channel },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
  if (!thread) {
    console.error(`No ${channel} thread for that org.`);
    process.exit(1);
  }

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { settings: true },
  });
  const settings = resolveAgentSettings(org?.settings ?? null);
  const ctx = await buildContext(thread.id, orgId, gatewayThreadSink);
  if (!ctx) {
    console.error('Could not build a context for that thread.');
    process.exit(1);
  }

  const { stable, volatile } = buildSystemPromptParts(ctx, settings);

  const moduleTools = {
    ...buildOperatorInboxTools({ organizationId: orgId }),
    ...buildOperatorProductHelpTools(),
    ...buildOperatorShopTools({ organizationId: orgId }),
  };
  const tools = Object.values(moduleTools).map((def) => ({
    name: def.name,
    description: def.description,
    input_schema: def.inputSchema,
  }));

  const probe = [{ role: 'user' as const, content: '.' }];
  const count = async (body: Record<string, unknown>): Promise<number> => {
    const res = await anthropic.messages.countTokens({
      model: SONNET_MODEL,
      messages: probe,
      ...body,
    } as Parameters<typeof anthropic.messages.countTokens>[0]);
    return res.input_tokens;
  };

  // Each section is measured against the same one-character baseline, so the
  // differences are the section's own cost rather than the envelope's.
  const baseline = await count({});
  const withStable = await count({ system: stable });
  const withVolatile = await count({ system: volatile });
  const withTools = await count({ tools });

  // Exactly the window run.ts sends on an operator turn.
  const history = channel === 'sms_agent' ? ctx.recentMessages.slice(-20) : ctx.recentMessages;
  const historyMessages = buildMessageHistory(history, 'probe instruction', {
    segregateUntrusted: false,
  });
  const withHistory = await anthropic.messages.countTokens({
    model: SONNET_MODEL,
    messages: historyMessages,
  } as Parameters<typeof anthropic.messages.countTokens>[0]);

  const stableTokens = withStable - baseline;
  const volatileTokens = withVolatile - baseline;
  const toolTokens = withTools - baseline;
  const historyTokens = withHistory.input_tokens - baseline;
  const total = stableTokens + volatileTokens + toolTokens + historyTokens;

  const row = (label: string, tokens: number, note: string) => {
    const pct = total > 0 ? Math.round((tokens / total) * 100) : 0;
    console.log(`${label.padEnd(28)} ${String(tokens).padStart(7)}  ${`${pct}%`.padStart(4)}  ${note}`);
  };

  console.log(`${channel} prompt for thread ${thread.id}\n`);
  console.log(`${'section'.padEnd(28)} ${'tokens'.padStart(7)}  ${'  of'.padStart(4)}  cache`);
  row('tool definitions', toolTokens, '1h (inside the stable breakpoint)');
  row('stable prefix', stableTokens, '1h, budget-exempt');
  row('volatile', volatileTokens, '5m, counts at 1.25x when rewritten');
  row(`message history (${history.length} msgs)`, historyTokens, 'uncached — full price, every call');
  console.log(`${'-'.repeat(28)} ${String(total).padStart(7)}`);

  // What each opening actually costs the loop budget, per usage.ts weights.
  const cached = toolTokens + stableTokens + volatileTokens;
  const coldAll = Math.round(cached * 1.25 + historyTokens);
  const cold1hHit = Math.round(volatileTokens * 1.25 + (toolTokens + stableTokens) * 0.1 + historyTokens);
  const warm = Math.round(cached * 0.1 + historyTokens);
  console.log('\nOpening cost against TOKEN_BUDGET = 20,000:');
  console.log(`  everything cold, no 1h block attributed   ${String(coldAll).padStart(7)}`);
  console.log(`  1h block hit, volatile rewritten          ${String(cold1hHit).padStart(7)}`);
  console.log(`  fully warm                                ${String(warm).padStart(7)}`);
  console.log(
    '\nThe middle row is the common case for a merchant who texts less often than'
    + '\nevery five minutes. If it is the bulk of the budget, the volatile block is'
    + '\nwhere to look — not the stable prefix, which is already exempt.',
  );

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
