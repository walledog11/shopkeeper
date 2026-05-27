import { describe, expect, it } from 'vitest';
import { EMPTY_MEMORY } from '@clerk/db';
import { allowTestNetworkHosts } from '../../../../scripts/test-network-guard.mjs';
import { summarizeCustomerMemory } from './customer-memory-summarizer.js';

const hasRealKey =
  typeof process.env.ANTHROPIC_API_KEY === 'string' &&
  process.env.ANTHROPIC_API_KEY.length > 0 &&
  process.env.ANTHROPIC_API_KEY !== 'test-anthropic-key';
const runRealAnthropic = hasRealKey && process.env.RUN_REAL_ANTHROPIC_TESTS === 'true';

describe('customer memory summarizer — real Claude', () => {
  if (!runRealAnthropic) {
    it.skip('requires RUN_REAL_ANTHROPIC_TESTS=true and a real ANTHROPIC_API_KEY', () => {});
    return;
  }

  it(
    'summarizes an empty prior memory and closed shipping complaint thread',
    async () => {
      allowTestNetworkHosts('api.anthropic.com');

      const result = await summarizeCustomerMemory({
        priorMemory: EMPTY_MEMORY,
        customer: {
          id: 'customer-real-memory',
          organizationId: 'org-real-memory',
          name: 'Jane Smith',
          platformId: 'jane@example.com',
        },
        closedThread: {
          id: 'thread-real-memory',
          organizationId: 'org-real-memory',
          customerId: 'customer-real-memory',
          channelType: 'email',
          tag: 'Shipping',
          subject: 'Late delivery',
          aiSummary: 'Customer reported a late delivery, asked for clearer shipping updates, and accepted the tracking ETA.',
          createdAt: '2026-05-25T10:00:00.000Z',
          updatedAt: '2026-05-26T12:00:00.000Z',
        },
        messages: [
          {
            id: 'm1',
            senderType: 'customer',
            contentText: 'My order is late again. Please remember that I prefer delivery updates by email instead of SMS.',
            sentAt: '2026-05-25T10:00:00.000Z',
          },
          {
            id: 'm2',
            senderType: 'agent',
            contentText: 'Thanks for flagging this. The carrier now shows delivery by Friday, and we will use email for updates.',
            sentAt: '2026-05-25T10:05:00.000Z',
          },
        ],
      });

      expect(result.summary.toLowerCase()).toMatch(/ship|deliver|package|carrier/);
      expect(result.keyFacts.length).toBeGreaterThan(0);
      expect(result.recentInteractions[0]).toMatchObject({
        threadId: 'thread-real-memory',
        channel: 'email',
        tag: 'Shipping',
      });
    },
    60_000,
  );
});
