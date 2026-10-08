import { beforeEach, describe, expect, it, vi } from 'vitest';
const { create, cap, spend } = vi.hoisted(() => ({ create: vi.fn(), cap: vi.fn(), spend: vi.fn() }));
vi.mock('@shopkeeper/agent/ai', () => ({ anthropic: { messages: { create } }, HAIKU_MODEL: 'test-model' }));
vi.mock('@shopkeeper/agent/spend', () => ({ enforceSpendCap: cap, recordSpend: spend }));
import { narrateBriefingItems } from './narrate.js';
import { buildConversationBrief } from './conversation.js';
import { formatNeedsYouProse } from './needs-you.js';
import type { BriefingItem } from './types.js';

const SOURCE = 'Does the lavender candle contain paraffin?';
const DRAFT = 'Our lavender candle is made with soy wax and contains no paraffin.';
function item(overrides: Partial<BriefingItem> = {}): BriefingItem {
  return {
    threadId: 'sarah-thread', planId: 'sarah-plan', kind: 'approval',
    conversation: buildConversationBrief({
      customerName: 'Sarah Jones', sourceText: SOURCE, now: new Date('2026-09-05'),
      rawToolCalls: [{ name: 'send_reply', input: { text: DRAFT } }],
    }),
    ...overrides,
  };
}
function response(items: unknown[]) {
  return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ items }) }],
    usage: { input_tokens: 50, output_tokens: 30 } };
}
const SUMMARY = { id: 0,
  request: { text: 'asked whether the lavender candle contains paraffin', evidence: SOURCE },
  draft: { text: 'explaining that the candle is made with soy wax and contains no paraffin', evidence: DRAFT },
};
beforeEach(() => { vi.resetAllMocks(); cap.mockResolvedValue(undefined); spend.mockResolvedValue(undefined); });

describe('briefing narration', () => {
  it('writes grounded paragraphs while preserving exact plan identity and the missing-context restriction', async () => {
    create.mockResolvedValue(response([SUMMARY]));
    const missing = item({ threadId: 'james-thread', planId: undefined, kind: 'decision', needsThreadReview: true,
      conversation: { ...buildConversationBrief({ customerName: 'James', now: new Date() }),
        threadUrl: 'https://shop.example/dashboard/tickets?thread=james-thread' } });
    const original = [item(), missing];
    const result = await narrateBriefingItems('org', original, { dailyLLMSpendCapUsd: 3 });
    expect(result[0]).toMatchObject({ threadId: 'sarah-thread', planId: 'sarah-plan', kind: 'approval' });
    expect(result[1]).toBe(missing);
    expect(original[0]?.conversation?.request).toContain('wrote:');
    expect(formatNeedsYouProse(result)).toBe([
      "Sarah asked whether the lavender candle contains paraffin. I've drafted a reply explaining that the candle is made with soy wax and contains no paraffin. Shall I send it?",
      "I couldn't retrieve the request details for James's conversation. Please review the original message. Open thread: https://shop.example/dashboard/tickets?thread=james-thread",
    ].join('\n\n'));
    expect(cap).toHaveBeenCalledWith('org', { dailyLLMSpendCapUsd: 3 });
    expect(spend).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[1]).toEqual({ timeout: 15_000, maxRetries: 0 });
    expect(JSON.parse(create.mock.calls[0]?.[0].messages[0].content)).toHaveLength(1);
  });

  it.each(['timeout', 'spend cap'])('keeps the request and actual draft when unavailable due to %s', async (failure) => {
    if (failure === 'spend cap') cap.mockRejectedValue(new Error('cap'));
    else create.mockRejectedValue(new Error('timeout'));
    const original = [item()];
    expect(await narrateBriefingItems('org', original, {})).toBe(original);
    const text = formatNeedsYouProse(original)!;
    expect(text).toContain(SOURCE);
    expect(text).toContain(DRAFT);
    expect(text).toContain('Shall I send it?');
    if (failure === 'spend cap') expect(create).not.toHaveBeenCalled();
  });

  it('rejects cross-source evidence without discarding the usable part of a summary', async () => {
    create.mockResolvedValue(response([{ ...SUMMARY, request: { text: 'asked for a refund', evidence: DRAFT } }]));
    const result = await narrateBriefingItems('org', [item()], {});
    expect(result[0]?.conversation?.request).toContain(SOURCE);
    expect(result[0]?.conversation?.draft).toContain('soy wax');
    expect(result[0]?.conversation?.request).not.toContain('refund');
  });

  it.each([
    { entries: [{ ...SUMMARY, id: 7 }] },
    { entries: [SUMMARY, SUMMARY] },
  ])('falls back on invalid or duplicate output ids', async ({ entries }) => {
    create.mockResolvedValue(response(entries));
    const original = [item()];
    expect(await narrateBriefingItems('org', original, {})).toBe(original);
  });

  it('falls back on malformed or truncated provider responses and still records usage', async () => {
    const original = [item()];
    create.mockResolvedValue({ ...response([]), content: [{ type: 'text', text: '{' }] });
    expect(await narrateBriefingItems('org', original, {})).toBe(original);
    create.mockResolvedValue({ ...response([SUMMARY]), stop_reason: 'max_tokens' });
    expect(await narrateBriefingItems('org', original, {})).toBe(original);
    expect(spend).toHaveBeenCalledTimes(2);
  });

  it('never submits missing-context items or clipped drafts to the writer', async () => {
    const original = [item({ needsThreadReview: true }), item({ conversation: buildConversationBrief({
      customerName: 'Alex', now: new Date(), rawToolCalls: [{ name: 'send_reply', input: { text: 'Long '.repeat(200) } }],
    }) })];
    expect(await narrateBriefingItems('org', original, {})).toBe(original);
    expect(create).not.toHaveBeenCalled();
  });
});
