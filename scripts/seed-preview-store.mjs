// Seeds the local preview store used to screenshot-judge dashboard UI changes.
// A solo-merchant store: open tickets across email, Instagram, and Shopify chat,
// covering quick_reply / needs_review / needs_merchant_input, an escalated
// ticket, overnight-cleared tickets, KB articles, and an agent-action trail.
//
// Run: npm run preview:seed
// Then: npm run preview:serve   (production build, fastest)
//    or npm run preview:dev     (next dev with HMR on :3100)
import { randomUUID } from 'node:crypto';
import { resetTestData, resolveTestEnv, seedE2ETestData } from './test-infra.mjs';

const env = resolveTestEnv(process.env);
const { PrismaClient } = await import('@prisma/client');

const AGENT_NAME = 'Wren';
const now = Date.now();
const ago = (minutes) => new Date(now - minutes * 60_000);

function planStep(tool, label, description, category, id = randomUUID()) {
  return { id, tool, label, description, category, enabled: true };
}

function toolCall(id, name, input) {
  return { id, name, input };
}

function cachedPlan({ instruction, steps, rawToolCalls, warnings }) {
  return {
    version: 5,
    planId: randomUUID(),
    instruction,
    lastCustomerMessageId: null,
    settingsFingerprint: 'preview-harness',
    plan: {
      instruction,
      steps,
      rawToolCalls,
      ...(warnings ? { warnings } : {}),
    },
  };
}

async function main() {
  await resetTestData(process.env);
  await seedE2ETestData(process.env);

  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });

  try {
    const org = await prisma.organization.findFirstOrThrow({
      where: { clerkOrgId: env.E2E_CLERK_ORG_ID },
    });

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        name: 'Linen & Loom',
        settings: {
          agentName: AGENT_NAME,
          autonomyTier: 'guarded',
          maxRefundAmount: 75,
          autoPlanOnOpen: true,
          spamFilterEnabled: true,
          businessHoursEnabled: true,
          onboardingCompletedAt: '2020-01-01T00:00:00.000Z',
          aiContext: 'We sell handwoven linen bedding. Ships in 2-3 business days. 30-day returns on unused items.',
          brandVoice: 'Warm and direct. Never over-apologise. Plain language, short sentences.',
        },
      },
    });

    const customer = (name, platformId) => prisma.customer.create({
      data: { organizationId: org.id, name, platformId },
    });
    const thread = (data) => prisma.thread.create({ data: { organizationId: org.id, ...data } });
    const message = (threadId, senderType, contentText, sentAt) => prisma.message.create({
      data: { organizationId: org.id, threadId, senderType, contentText, sentAt },
    });

    const maya = await customer('Maya Ellison', 'maya.ellison@example.com');
    const devon = await customer('Devon Park', 'devon.park@example.com');
    const priya = await customer('Priya Raman', 'priya.raman@example.com');
    const jonas = await customer('Jonas Weber', 'jonas.weber@example.com');
    const alice = await customer('Alice Fournier', 'alice.fournier@example.com');
    const rina = await customer('Rina Kobayashi', '17841400000000001');
    const josh = await customer('Josh', 'shopify_chat:preview-josh');
    const gary = await customer('Gary', '17841400000000002');
    const malik = await customer('Malik', 'malik.customer@example.com');

    // 1. Quick reply — a WISMO the agent can answer outright.
    const t1 = await thread({
      customerId: maya.id,
      channelType: 'email',
      status: 'open',
      subject: 'Where is my order?',
      tag: 'Shipping',
      lastMessageAt: ago(18),
      lastMessageSenderType: 'customer',
      aiSummary: 'Asking where order #1042 is after five days with no tracking update.',
    });
    const m1 = await message(t1.id, 'customer', "Hi! I ordered the flax duvet set on the 3rd (order #1042) and the tracking hasn't moved in five days. Is it lost?", ago(18));
    await prisma.thread.update({
      where: { id: t1.id },
      data: {
        cachedPlanMessageId: m1.id,
        cachedPlan: cachedPlan({
          instruction: 'Answer the customer',
          steps: [
            planStep('get_order_status', 'Check order', 'Check the carrier scan history for order #1042', 'read'),
            planStep('send_reply', 'Send reply', 'Reply to Maya', 'communication'),
          ],
          rawToolCalls: [
            { id: randomUUID(), name: 'get_order_status', input: { order_number: '1042' } },
            {
              id: randomUUID(),
              name: 'send_reply',
              input: {
                text: "Hi Maya — good news, it's not lost. Your duvet set cleared the Chicago sorting facility this morning after a weather hold; the carrier just hadn't posted a scan since the 5th. It's out for delivery Thursday. Here's the live tracking: 9400 1112 0000 1234 5678. Sorry for the silent stretch.",
              },
            },
          ],
        }),
      },
    });

    // 2. Needs review — a refund over the cap.
    const t2 = await thread({
      customerId: devon.id,
      channelType: 'email',
      status: 'open',
      subject: 'Damaged on arrival',
      tag: 'Returns',
      lastMessageAt: ago(44),
      lastMessageSenderType: 'customer',
      aiSummary: 'Duvet arrived with a tear along the seam; wants a refund rather than a replacement.',
    });
    const m2 = await message(t2.id, 'customer', "The duvet arrived with a six-inch tear along the bottom seam. I don't want a replacement, I'd just like my money back please. Order #1051, $128.", ago(44));
    await prisma.thread.update({
      where: { id: t2.id },
      data: {
        cachedPlanMessageId: m2.id,
        cachedPlan: cachedPlan({
          instruction: 'Answer the customer',
          steps: [
            planStep('get_order_status', 'Check order', 'Confirm #1051 is still unfulfilled', 'read'),
            planStep('create_refund', 'Issue refund', 'Refund $128 to the original payment method', 'action'),
            planStep('send_reply', 'Send reply', 'Reply to Devon', 'communication'),
          ],
          rawToolCalls: [
            { id: randomUUID(), name: 'get_order_status', input: { order_number: '1051' } },
            { id: randomUUID(), name: 'create_refund', input: { order_number: '1051', amount: 128, reason: 'Damaged on arrival' } },
            {
              id: randomUUID(),
              name: 'send_reply',
              input: {
                text: "Hi Devon — that's a manufacturing fault, not something you should have to send back. I've refunded the full $128 to your card; it'll land in 3-5 business days. Keep the duvet or pass it on, whichever you prefer.",
              },
            },
          ],
          warnings: ['Refund of $128 exceeds the $75 cap for the Ask first trust level.'],
        }),
      },
    });

    // 3. Needs merchant input — the agent parked a question.
    const t3 = await thread({
      customerId: rina.id,
      channelType: 'ig_dm',
      status: 'open',
      tag: 'Product Inquiry',
      lastMessageAt: ago(96),
      lastMessageSenderType: 'customer',
      aiSummary: 'Asking whether the framed linen prints ship to Canada.',
    });
    const m3 = await message(t3.id, 'customer', 'do the framed prints ship to canada? and is there duty on top', ago(96));
    await prisma.thread.update({
      where: { id: t3.id },
      data: {
        cachedPlanMessageId: m3.id,
        cachedPlan: cachedPlan({
          instruction: 'Answer the customer',
          steps: [
            planStep('search_kb', 'Search memory', 'Look for a shipping policy covering Canada', 'read'),
            planStep('ask_operator', 'Ask you', 'Ask whether framed prints ship to Canada', 'internal'),
          ],
          rawToolCalls: [
            { id: randomUUID(), name: 'search_kb', input: { query: 'international shipping canada duty' } },
            {
              id: randomUUID(),
              name: 'ask_operator',
              input: { question: 'Do the framed prints ship to Canada, and do you cover duty or does the customer pay it?' },
            },
          ],
        }),
      },
    });

    // 4. Escalated — the agent handed it over.
    const t4 = await thread({
      customerId: priya.id,
      channelType: 'email',
      status: 'open',
      subject: 'Re: Order #1033 — this is my third email',
      tag: 'needs_human',
      lastMessageAt: ago(130),
      lastMessageSenderType: 'ai',
      escalatedAt: ago(129),
      aiSummary: 'Third unanswered email; threatening a chargeback over a missing $240 order.',
    });
    await message(t4.id, 'customer', "This is my third email about order #1033. $240 and nobody will tell me where it is. If I don't hear back today I'm calling my bank and filing a chargeback.", ago(132));
    await message(t4.id, 'ai', "Priya — you're right to be frustrated and I'm not going to give you another holding reply. I'm passing this to the owner directly with everything on the order; you'll hear from a person today.", ago(130));

    // 5. Waiting on the customer.
    const t5 = await thread({
      customerId: jonas.id,
      channelType: 'email',
      status: 'open',
      subject: 'Exchange for a larger size',
      tag: 'Returns',
      lastMessageAt: ago(300),
      lastMessageSenderType: 'ai',
      aiSummary: 'Wants to exchange a king for a super king; waiting on confirmation.',
    });
    await message(t5.id, 'customer', 'Can I swap the king for a super king? Order #1029.', ago(320));
    await message(t5.id, 'ai', 'Of course. The super king is $40 more — happy to send a return label and charge the difference, or refund the king and you reorder. Which suits you?', ago(300));

    // 6. Merchant-input — care question not fully covered in memory.
    const t6 = await thread({
      customerId: alice.id,
      channelType: 'email',
      status: 'open',
      subject: 'Care instructions',
      tag: 'Product Inquiry',
      lastMessageAt: ago(6),
      lastMessageSenderType: 'customer',
      aiSummary: 'Asking whether the linen can be tumble dried.',
    });
    const m6 = await message(t6.id, 'customer', 'Quick one — can the linen go in the tumble dryer or will it shrink?', ago(6));
    await prisma.thread.update({
      where: { id: t6.id },
      data: {
        cachedPlanMessageId: m6.id,
        cachedPlan: cachedPlan({
          instruction: 'Answer the customer',
          steps: [
            planStep('search_kb', 'Search memory', 'Look for linen care and drying guidance', 'read'),
            planStep('ask_operator', 'Ask you', 'Confirm tumble-dry guidance for linen', 'internal'),
          ],
          rawToolCalls: [
            { id: randomUUID(), name: 'search_kb', input: { query: 'linen tumble dry care instructions' } },
            {
              id: randomUUID(),
              name: 'ask_operator',
              input: {
                question: 'Can our linen go in the tumble dryer on low, or should we tell customers line dry only?',
              },
            },
          ],
        }),
      },
    });

    // 7. Merchant-input — restock timing needs merchant confirmation.
    const t7 = await thread({
      customerId: josh.id,
      channelType: 'shopify_chat',
      status: 'open',
      tag: 'Product Inquiry',
      lastMessageAt: ago(8),
      lastMessageSenderType: 'customer',
      aiSummary: 'Asking when the pink snowboard will be back in stock.',
    });
    const m7 = await message(t7.id, 'customer', 'Hey do you know when the new pink snowboard will restock?', ago(8));
    await prisma.thread.update({
      where: { id: t7.id },
      data: {
        cachedPlanMessageId: m7.id,
        cachedPlan: cachedPlan({
          instruction: 'Answer the customer',
          steps: [
            planStep('search_kb', 'Search memory', 'Check for pink snowboard restock notes', 'read'),
            planStep('ask_operator', 'Ask you', 'Confirm the pink snowboard restock date', 'internal'),
          ],
          rawToolCalls: [
            { id: randomUUID(), name: 'search_kb', input: { query: 'pink snowboard restock' } },
            {
              id: randomUUID(),
              name: 'ask_operator',
              input: {
                question: 'When will the pink snowboard restock — is mid-September still accurate, and should we mention notify-me?',
              },
            },
          ],
        }),
      },
    });

    // 8. Quick reply — shipping update the agent can send without merchant input.
    const t8 = await thread({
      customerId: gary.id,
      channelType: 'ig_dm',
      status: 'open',
      tag: 'Shipping',
      lastMessageAt: ago(22),
      lastMessageSenderType: 'customer',
      aiSummary: 'Wants a shipping update — says the order has been waiting a while.',
    });
    const m8 = await message(t8.id, 'customer', "When will my order ship it's been a while", ago(22));
    const garyReadId = randomUUID();
    const garyReplyId = randomUUID();
    await prisma.thread.update({
      where: { id: t8.id },
      data: {
        cachedPlanMessageId: m8.id,
        cachedPlan: cachedPlan({
          instruction: 'Answer the customer',
          steps: [
            planStep('send_reply', 'Send reply', 'Reply to Gary with the shipping update', 'communication', garyReplyId),
          ],
          rawToolCalls: [
            toolCall(garyReadId, 'get_shopify_orders', { customer_email: 'gary@example.com' }),
            toolCall(garyReplyId, 'send_reply', {
              text: "Hey Gary — checked on this: your order left the warehouse yesterday and is with the carrier now. Tracking shows delivery Friday. I'll drop the link here if you need it.",
            }),
          ],
        }),
      },
    });

    // 9. Needs review — address change proposal for merchant approval.
    const t9 = await thread({
      customerId: malik.id,
      channelType: 'email',
      status: 'open',
      subject: 'Change shipping address',
      tag: 'Order Status',
      lastMessageAt: ago(14),
      lastMessageSenderType: 'customer',
      aiSummary: 'Wants the shipping address updated on a recent order.',
    });
    const m9 = await message(t9.id, 'customer', 'Could you change the address on my order?', ago(14));
    await prisma.thread.update({
      where: { id: t9.id },
      data: {
        cachedPlanMessageId: m9.id,
        cachedPlan: cachedPlan({
          instruction: 'Answer the customer',
          steps: [
            planStep('get_order_by_name', 'Find order', "Look up Malik's most recent open order", 'read'),
            planStep('update_shopify_order_address', 'Update address', 'Update shipping address on order #1062 to 742 Evergreen Terrace, Springfield, IL 62704', 'action'),
            planStep('send_reply', 'Send reply', 'Confirm the address change to Malik', 'communication'),
          ],
          rawToolCalls: [
            { id: randomUUID(), name: 'get_shopify_orders', input: { customer_email: 'malik.customer@example.com' } },
            {
              id: randomUUID(),
              name: 'update_shopify_order_address',
              input: {
                order_number: '#1062',
                address1: '742 Evergreen Terrace',
                city: 'Springfield',
                province: 'IL',
                zip: '62704',
                country: 'US',
              },
            },
            {
              id: randomUUID(),
              name: 'send_reply',
              input: {
                text: "Hi Malik — I can update the shipping address on order #1062 before it leaves the warehouse. Reply with the full new address and I'll confirm once it's changed.",
              },
            },
          ],
        }),
      },
    });

    // Overnight cleared: closed in the last 24h with the agent last to speak.
    // Five distinct tags against a four-tag query cap, so the remainder folds
    // into "other" on the home line.
    const cleared = [
      ['Shipping', 3],
      ['Returns', 2],
      ['Order Status', 1],
      ['Product Inquiry', 1],
      ['General', 1],
    ];
    let clearedIndex = 0;
    for (const [tag, count] of cleared) {
      for (let i = 0; i < count; i += 1) {
        clearedIndex += 1;
        const c = await customer(`Overnight ${clearedIndex}`, `overnight${clearedIndex}@example.com`);
        const t = await thread({
          customerId: c.id,
          channelType: 'email',
          status: 'closed',
          subject: `${tag} question`,
          tag,
          lastMessageAt: ago(200 + clearedIndex * 7),
          lastMessageSenderType: 'ai',
          updatedAt: ago(200 + clearedIndex * 7),
        });
        await message(t.id, 'customer', `A ${tag.toLowerCase()} question from overnight.`, ago(210 + clearedIndex * 7));
        await message(t.id, 'ai', 'Answered and closed.', ago(200 + clearedIndex * 7));
      }
    }

    // Knowledge base.
    const notes = await prisma.knowledgeBase.create({
      data: { organizationId: org.id, name: 'Notes', source: 'user' },
    });
    const shopifyBase = await prisma.knowledgeBase.create({
      data: { organizationId: org.id, name: 'Shopify', source: 'shopify' },
    });
    const wholesale = await prisma.knowledgeBase.create({
      data: { organizationId: org.id, name: 'Wholesale', source: 'user' },
    });

    const article = (baseId, title, body, tags = []) => prisma.kbArticle.create({
      data: { organizationId: org.id, knowledgeBaseId: baseId, title, body, tags },
    });

    await article(notes.id, 'Return window', 'Thirty days from delivery on unused items in original packaging. Sale items are final.', ['Returns']);
    await article(notes.id, 'Damaged on arrival', 'Refund in full without asking for the item back when a photo shows a seam or weave fault.', ['Returns']);
    await article(notes.id, 'Restock timing', 'The oatmeal and clay colourways restock on the first Tuesday of each month.', ['Product Inquiry']);
    await article(shopifyBase.id, 'Pink snowboard restock', 'The pink snowboard is sold out. The next restock is expected mid-September; shoppers can use notify-me on the product page.', ['Product Inquiry']);
    await article(shopifyBase.id, 'Shipping policy', 'Free standard shipping over $120. Express is $18 and ships same day before 2pm.', ['Shipping']);
    await article(shopifyBase.id, 'Refund policy', 'Refunds are issued to the original payment method within 5 business days of receipt.', ['Returns']);
    await article(wholesale.id, 'Minimum order', 'Wholesale opens at twelve units per colourway with net-30 terms after the first order.', []);

    // Agent action audit trail for the Review page. Statuses and modes match
    // the executor's real enums (success/error/policy_block/escalated/unknown
    // and auto_executed/human_approved/read_only) so the page is judged against
    // the states it actually renders.
    const actions = [
      ['send_reply', 'communication', 'success', 'auto_executed', 'Answered a tracking question for order #1038.', t1.id,
        { text: 'Your order left the warehouse Tuesday and is due Thursday. Tracking: 9400 1112 0000 1234 5678.' }],
      ['get_order_status', 'read', 'success', 'read_only', 'Looked up order #1038.', t1.id, { order_number: '1038' }],
      ['create_refund', 'action', 'policy_block', 'human_approved', 'Refund of $128 exceeded the $75 cap.', t2.id,
        { order_number: '1051', amount: 128 }],
      ['send_reply', 'communication', 'success', 'human_approved', 'Confirmed an exchange for order #1029.', t5.id,
        { text: "I've sent a return label for the king and put the super king aside for you." }],
      ['escalate_to_human', 'internal', 'escalated', 'auto_executed', 'Handed order #1033 to the merchant.', t4.id,
        { reason: 'Customer is threatening a chargeback and this is their third unanswered email.' }],
      ['search_kb', 'read', 'success', 'read_only', 'Searched memory for international shipping.', t3.id,
        { query: 'international shipping canada duty' }],
      ['create_gift_card', 'action', 'success', 'human_approved', 'Created the explicitly requested $40 gift card for a late delivery.', t5.id,
        { amount: 40, customer_id: jonas.id }],
      ['send_email', 'communication', 'error', 'auto_executed', 'Postmark rejected the address.', t5.id,
        { subject: 'Your linen care guide', body: 'Cool wash, line dry, warm iron while slightly damp.' }],
      ['flag_order', 'action', 'success', 'auto_executed', 'Flagged order #1044: billing and shipping countries differ.', null,
        { order_number: '1044' }],
    ];
    for (const [index, [tool, category, status, mode, summary, threadId, input]] of actions.entries()) {
      await prisma.agentAction.create({
        data: {
          turnId: randomUUID(),
          organizationId: org.id,
          threadId,
          tool,
          category,
          input,
          status,
          mode,
          summary,
          durationMs: 400 + index * 240,
          executedAt: ago(45 + index * 55),
        },
      });
    }

    console.log('[seed-preview-store] seeded', {
      customers: await prisma.customer.count({ where: { organizationId: org.id } }),
      threads: await prisma.thread.count({ where: { organizationId: org.id } }),
      open: await prisma.thread.count({ where: { organizationId: org.id, status: 'open' } }),
      articles: await prisma.kbArticle.count({ where: { organizationId: org.id } }),
      actions: await prisma.agentAction.count({ where: { organizationId: org.id } }),
      ticketDetail: `/dashboard/tickets/${t6.id}`,
      escalatedTicket: `/dashboard/tickets/${t4.id}`,
      userScenarios: {
        aliceMerchantInput: `/dashboard/tickets/${t6.id}`,
        joshShopifyChat: `/dashboard/tickets/${t7.id}`,
        garyInstagram: `/dashboard/tickets/${t8.id}`,
        malikEmail: `/dashboard/tickets/${t9.id}`,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

await main();
