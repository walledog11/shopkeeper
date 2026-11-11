/**
 * What the agent could read from Memory on one ticket: the knowledge-base
 * articles its planning turn pre-loads (the same ranking context.ts uses), the
 * searches its proposals ran with what they match now, the articles it cited,
 * and every article in the workspace. Read-only.
 *
 *   railway run --service shopkeeper --environment production -- \
 *     npm run inspect:ticket-memory -- --ticket <id or link>
 * Needs DATABASE_URL.
 */
import { parseArgs } from 'node:util';
import { Prisma, db, recordCustomerDataAccess, scriptActor } from '@shopkeeper/db';
import { MEMORY_OVERRIDE_TAG, memoryOverrideTargetIds } from '@shopkeeper/agent/kb-memory';

const { values } = parseArgs({ options: { ticket: { type: 'string' } } });

const at = (date: Date | null | undefined) => (date ? date.toISOString().replace('T', ' ').slice(0, 19) : '-');
const oneLine = (text: string, limit = 160) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
};

async function main(): Promise<void> {
  const ticketId = values.ticket?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (!ticketId) throw new Error('Usage: --ticket <ticket id or link>');

  const thread = await db.thread.findUnique({
    where: { id: ticketId },
    select: { id: true, organizationId: true, tag: true, channelType: true, createdAt: true, requestSummary: true },
  });
  if (!thread) throw new Error(`No ticket ${ticketId}`);
  const organizationId = thread.organizationId;
  await recordCustomerDataAccess({
    organizationId, actor: scriptActor('inspect-ticket-memory'), resource: 'script', resourceId: thread.id,
  });
  console.log(`Ticket ${thread.id} · ${thread.channelType} · tag ${thread.tag ?? '-'} · created ${at(thread.createdAt)}`);
  console.log(`Request: ${thread.requestSummary ?? '-'}\n`);

  const turns = await db.agentTurnUsage.findMany({
    where: { organizationId, threadId: thread.id },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, purpose: true, modelCalls: true, outcome: true },
  });
  console.log('Agent turns:');
  for (const turn of turns) console.log(`  ${at(turn.createdAt)}  ${turn.purpose} · ${turn.modelCalls} model call(s) · ${turn.outcome}`);

  const proposals = await db.agentProposal.findMany({
    where: { organizationId, task: { threadId: thread.id } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, status: true, canonicalActions: true, approvedDraft: true },
  });
  const searches: string[] = [];
  console.log('\nProposals (every call the plan made, reads included):');
  for (const proposal of proposals) {
    const calls = Array.isArray(proposal.canonicalActions)
      ? proposal.canonicalActions as Array<{ name?: string; input?: Record<string, unknown> }>
      : [];
    console.log(`  ${at(proposal.createdAt)}  ${proposal.status}: ${calls.map((call) => call.name).join(', ') || '-'}`);
    for (const call of calls) {
      if (call.name === 'search_kb' && typeof call.input?.query === 'string') {
        searches.push(call.input.query);
        console.log(`    search_kb "${call.input.query}"`);
      }
    }
    if (proposal.approvedDraft) console.log(`    draft: ${oneLine(proposal.approvedDraft, 240)}`);
  }

  const citations = await db.kbCitation.findMany({
    where: { organizationId, threadId: thread.id },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, article: { select: { title: true } } },
  });
  console.log('\nArticles a search on this ticket returned as answering:');
  if (citations.length === 0) console.log('  none');
  for (const citation of citations) console.log(`  ${at(citation.createdAt)}  ${citation.article.title}`);

  const overrides = await db.kbArticle.findMany({
    where: { organizationId, tags: { has: MEMORY_OVERRIDE_TAG } },
    select: { tags: true },
  });
  const overriddenIds = memoryOverrideTargetIds(overrides);
  // The planning turn's pre-load, as context.ts ranks it: articles tagged like
  // the ticket first, then the most recently updated, three of them.
  const ranked = await db.$queryRaw<Array<{ id: string; title: string; body: string; tags: string[]; updated_at: Date; created_at: Date }>>(Prisma.sql`
    SELECT id, title, body, tags, updated_at, created_at FROM kb_articles
    WHERE organization_id = ${organizationId}::uuid
    ${overriddenIds.length ? Prisma.sql`AND id NOT IN (${Prisma.join(overriddenIds.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.empty}
    ORDER BY EXISTS (SELECT 1 FROM unnest(tags) AS tag WHERE lower(tag) = ${thread.tag?.toLowerCase() ?? null}) DESC,
      updated_at DESC, id DESC
  `);
  const planningAt = proposals[0]?.createdAt ?? null;
  console.log(`\nMemory: ${ranked.length} article(s), in pre-load order for this ticket today (the first 3 are pre-loaded):`);
  ranked.forEach((article, index) => {
    const changedSince = planningAt && article.updated_at > planningAt ? ' · updated after this ticket was planned' : '';
    const createdSince = planningAt && article.created_at > planningAt ? ' · created after this ticket was planned' : '';
    console.log(`  ${index + 1}. "${article.title}" [${article.tags.join(', ') || 'no tags'}] updated ${at(article.updated_at)}${changedSince}${createdSince}`);
    console.log(`     ${oneLine(article.body)}`);
  });

  // search_kb's first stage: any word of the query in a title or body.
  for (const query of searches) {
    const words = query.trim().split(/\s+/).filter((word) => word.length >= 2);
    const matches = await db.kbArticle.findMany({
      where: {
        organizationId,
        OR: words.flatMap((word) => [
          { title: { contains: word, mode: 'insensitive' as const } },
          { body: { contains: word, mode: 'insensitive' as const } },
        ]),
      },
      take: 10,
      orderBy: { updatedAt: 'desc' },
      select: { title: true },
    });
    console.log(`\nsearch_kb "${query}" matches today: ${matches.map((match) => `"${match.title}"`).join(', ') || 'none'}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
