import { afterEach, describe, expect, it } from 'vitest';
import {
  applyInboundAttachmentBudget,
  decodedByteLength,
  mapWithConcurrency,
  type InboundAttachment,
} from './attachment-budget.js';

const ENV_KEYS = [
  'GATEWAY_ATTACHMENT_MAX_COUNT',
  'GATEWAY_ATTACHMENT_MAX_BYTES',
  'GATEWAY_ATTACHMENT_MAX_TOTAL_BYTES',
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

function attachment(name: string, bytes: number): InboundAttachment {
  return {
    name,
    contentType: 'image/png',
    contentBase64: Buffer.alloc(bytes, 1).toString('base64'),
  };
}

describe('decodedByteLength', () => {
  it.each([0, 1, 2, 3, 10, 1024])('matches the real decoded size for %i bytes', (bytes) => {
    const base64 = Buffer.alloc(bytes, 7).toString('base64');
    expect(decodedByteLength(base64)).toBe(bytes);
  });
});

describe('applyInboundAttachmentBudget', () => {
  it('accepts a normal message untouched', () => {
    const candidates = [attachment('a.png', 1000), attachment('b.png', 2000)];

    expect(applyInboundAttachmentBudget(candidates)).toEqual({
      accepted: candidates,
      rejected: [],
    });
  });

  it('drops attachments past the count cap and keeps the earlier ones', () => {
    process.env.GATEWAY_ATTACHMENT_MAX_COUNT = '2';
    const candidates = [attachment('a.png', 10), attachment('b.png', 10), attachment('c.png', 10)];

    const result = applyInboundAttachmentBudget(candidates);

    expect(result.accepted.map((a) => a.name)).toEqual(['a.png', 'b.png']);
    expect(result.rejected).toEqual([{ name: 'c.png', reason: 'count', bytes: 10 }]);
  });

  it('drops a single oversized attachment without losing its siblings', () => {
    process.env.GATEWAY_ATTACHMENT_MAX_BYTES = '1000';
    const candidates = [attachment('small.png', 500), attachment('huge.png', 2000), attachment('also-small.png', 400)];

    const result = applyInboundAttachmentBudget(candidates);

    expect(result.accepted.map((a) => a.name)).toEqual(['small.png', 'also-small.png']);
    expect(result.rejected).toEqual([{ name: 'huge.png', reason: 'too_large', bytes: 2000 }]);
  });

  it('stops accepting once the combined budget is exhausted', () => {
    process.env.GATEWAY_ATTACHMENT_MAX_TOTAL_BYTES = '1500';
    const candidates = [attachment('a.png', 1000), attachment('b.png', 1000), attachment('c.png', 400)];

    const result = applyInboundAttachmentBudget(candidates);

    expect(result.accepted.map((a) => a.name)).toEqual(['a.png', 'c.png']);
    expect(result.rejected).toEqual([{ name: 'b.png', reason: 'total_size', bytes: 1000 }]);
  });

  it('returns nothing to upload for a message with no attachments', () => {
    expect(applyInboundAttachmentBudget([])).toEqual({ accepted: [], rejected: [] });
  });
});

describe('mapWithConcurrency', () => {
  it('preserves input order in the results', async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      await new Promise((resolve) => setTimeout(resolve, (6 - n) * 2));
      return n * 10;
    });

    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it('never runs more than the limit at once', async () => {
    let active = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return null;
    });

    expect(peak).toBe(3);
  });

  it('handles an empty list without spawning workers', async () => {
    await expect(mapWithConcurrency([], 3, async () => 'x')).resolves.toEqual([]);
  });
});
