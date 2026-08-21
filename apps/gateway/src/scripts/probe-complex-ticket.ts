import { writeFileSync } from 'fs';
import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

const OUT: string[] = [];
function say(line: string): void {
  OUT.push(line);
  writeFileSync('/tmp/probe-ticket.txt', OUT.join('\n'));
}

// THROWAWAY — one realistic multi-intent support ticket through the real
// classifier, then rendered on both merchant surfaces: the operator plan card
// and the morning briefing line. Answers "how does the pipeline react to a
// complex ticket" without a live store, because the stage that decides both
// lines is the classifier, not Shopify.
//
// Writes to /tmp/probe-ticket.txt rather than stdout: the open Redis and Prisma
// handles keep the process alive past the last print, so piped stdout never
// flushes. Run against the local dev database, never production.
//
//   npx tsx --env-file=apps/gateway/.env apps/gateway/src/scripts/probe-complex-ticket.ts

const TICKET = [
  "Hi — I ordered the Hydrogen snowboard back on the 8th (order #1024) for my son's birthday",
  "this Saturday. It turned up yesterday and there's a deep gouge along the base, about four",
  "inches, right under the front binding. I'm not after a discount, I just need a board that",
  "isn't damaged before Saturday. Can you get a replacement out today? I'll send this one back",
  'as soon as the new one lands. One thing — we moved house last week so the address on the',
  'order is my old place, the new one is 14 Alder Row, Flat 2. And if a replacement genuinely',
  "can't get here by Friday then I'd rather just have my money back and I'll buy one locally.",
].join(' ');

async function main() {
  const { db } = await import('@shopkeeper/db');
  const { generateThreadIntelligence } = await import('../message-handlers/intelligence.js');
  const {
    formatEscalatedTicketLine,
    formatBriefingTicketLine,
  } = await import('../maintenance/digest-briefing.js');
  const { formatOperatorPlanMessage } = await import('../message-handlers/planning-notifications.js');

  const org = await db.organization.create({
    data: { name: 'Probe Shop', clerkOrgId: `probe_${Date.now()}`, settings: {} },
  });

  try {
    const customer = await db.customer.create({
      data: {
        organizationId: org.id,
        platformId: 'rowan.mcgrath@example.com',
        name: 'Rowan McGrath',
      },
    });
    const thread = await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        channelType: 'email',
        status: 'open',
      },
    });
    await db.message.create({
      data: {
        organizationId: org.id,
        threadId: thread.id,
        senderType: 'customer',
        contentText: TICKET,
        sentAt: new Date(),
      },
    });

    say('=== THE TICKET ===');
    say(TICKET);

    const updated = await generateThreadIntelligence(thread.id);
    if (!updated) throw new Error('classifier returned nothing');

    say('\n=== WHAT THE CLASSIFIER MADE OF IT ===');
    say(`tag:            ${updated.tag}`);
    say(`aiTitle:        ${updated.aiTitle}`);
    say(`aiSummary:      ${updated.aiSummary}`);
    say(`requestSummary: ${updated.requestSummary}`);
    say(`signals:        ${JSON.stringify(updated.classifierSignals)}`);

    const row = {
      customer: { name: customer.name },
      channelType: 'email',
      aiTitle: updated.aiTitle,
      aiSummary: updated.aiSummary,
      requestSummary: updated.requestSummary,
      tag: updated.tag,
    };

    say('\n=== BRIEFING LINE (escalated) — AFTER the fix ===');
    say(formatEscalatedTicketLine(row));

    say('\n=== BRIEFING LINE — what it would have said BEFORE (episode summary) ===');
    say(formatEscalatedTicketLine({ ...row, requestSummary: null }));

    say('\n=== INBOX LINE ===');
    say(formatBriefingTicketLine(
      customer.name, updated.aiTitle, updated.requestSummary, updated.tag, 'email',
    ));

    say('\n=== OPERATOR CARD header, from requestSummary ===');
    say(formatOperatorPlanMessage(
      customer.name,
      'email',
      updated.requestSummary ?? updated.aiSummary ?? '',
      [
        { id: 's1', tool: 'send_reply', label: 'Reply to customer', description: 'Reply', category: 'communication', enabled: true },
      ] as never,
      {
        rawToolCalls: [{ name: 'send_reply', input: { text: "I'm so sorry — let me sort this before Saturday." } }],
      },
    ));
  } finally {
    await db.organization.delete({ where: { id: org.id } }).catch(() => undefined);
    await db.$disconnect();
  }
}

main().then(() => process.exit(0)).catch((err) => {
  say(`ERROR: ${(err as Error).stack ?? err}`);
  process.exit(1);
});
