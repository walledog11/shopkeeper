import { describe, expect, it } from 'vitest';
import { buildConversationBrief, formatConversationParagraph } from './conversation.js';
import { formatNeedsYouProse } from './needs-you.js';
import type { BriefingItem } from './types.js';
const now = new Date('2026-09-05T12:00:00Z');

describe('conversation paragraphs', () => {
  it('keeps supported operator choices and does not turn the question into an approval', () => {
    const brief = buildConversationBrief({ customerName: 'James', sourceText: 'Order #1042 says delivered but I have not received it.', now,
      rawToolCalls: [{ name: 'ask_operator', input: { question: 'Would you like me to offer a replacement or a refund?' } }] });
    const paragraph = formatConversationParagraph(brief, 'decision', false);
    expect(paragraph).toContain('Order #1042');
    expect(paragraph).toContain('Would you like me to offer a replacement or a refund?');
    expect(paragraph).not.toContain('Shall I');
    const noChoices = formatConversationParagraph({ ...brief, question: null }, 'decision', false);
    expect(noChoices).not.toMatch(/refund|replacement/);
  });

  it('shows every non-read action alongside the draft, including additional sends', () => {
    const brief = buildConversationBrief({ customerName: 'Dana', sourceText: 'Please refund my order.', now,
      rawToolCalls: [
        { name: 'get_shopify_orders' },
        { name: 'create_refund', input: { amount: 12, currency: 'GBP' } },
        { name: 'send_reply', input: { text: 'Your refund is on its way.' } },
        { name: 'send_email', input: { body: 'Refund confirmation.' } },
        { name: 'escalate_to_human', input: { reason: 'Please review the complaint.' } },
      ] });
    const paragraph = formatConversationParagraph(brief, 'approval', false);
    expect(paragraph).toContain('12 GBP');
    expect(brief.actions).toHaveLength(3);
    expect(paragraph).toContain('Your refund is on its way.');
    expect(paragraph).not.toContain('get_shopify_orders');
    expect(paragraph).not.toContain('Shall I send it?');
  });

  it('uses natural factual fallback and retains deadlines without inventing an answer', () => {
    const brief = buildConversationBrief({ customerName: 'Sarah', now,
      facts: { ask: 'product_question', subject: 'the lavender candle', order: null,
        alternative: null, deadline: '2026-09-06', deadlineText: null } });
    expect(brief.request).toBe('Sarah has a question about the lavender candle.');
    expect(formatConversationParagraph(brief, 'decision', false)).toContain('Customer deadline: tomorrow');
    expect(brief.draft).toBeNull();
  });

  it('numbers paragraphs only when names are ambiguous and preserves their ledger order', () => {
    const items: BriefingItem[] = ['old', 'new'].map((threadId) => ({ threadId, kind: 'decision',
      conversation: buildConversationBrief({ customerName: 'Sarah', sourceText: threadId, now }) }));
    const result = formatNeedsYouProse(items)!;
    expect(result).toMatch(/^1\. Sarah wrote: "old"/);
    expect(result).toContain('\n\n2. Sarah wrote: "new"');
  });

  it('bounds large briefings, reports remaining work, and does not reorder a review item', () => {
    const items: BriefingItem[] = Array.from({ length: 10 }, (_, i) => ({ threadId: String(i), kind: 'decision',
      needsThreadReview: i === 0, conversation: buildConversationBrief({ customerName: `Customer${i}`, sourceText: `Request ${i}`, now }) }));
    const text = formatNeedsYouProse(items)!;
    expect(text).toMatch(/^I couldn't retrieve/);
    expect(text).toContain('Request 7');
    expect(text).not.toContain('Request 8');
    expect(text).toContain('Two more conversations need your attention.');
  });

  it('limits rich paragraphs without cutting a draft halfway through', () => {
    const items: BriefingItem[] = Array.from({ length: 8 }, (_, i) => ({ threadId: String(i), kind: 'approval',
      conversation: buildConversationBrief({ customerName: `Person${i}`, sourceText: 'Question '.repeat(40), now,
        rawToolCalls: [{ name: 'send_reply', input: { text: 'Detailed answer. '.repeat(35) } }] }) }));
    const text = formatNeedsYouProse(items)!;
    expect(text.length).toBeLessThan(2800);
    expect(text).toContain('Six more conversations need your attention.');
    expect(text.match(/Shall I send it\?/g)).toHaveLength(2);
  });
});
