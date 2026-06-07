import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_MEMORY,
  SpendCapError,
  SUMMARY_MAX_CHARS,
  type CustomerMemory,
} from '@shopkeeper/db';
import { MODEL } from '../constants.js';
import { summarizeCustomerMemory } from './customer-memory-summarizer.js';

const { mockAnthropicCreate, mockEnforceSpendCap, mockLogger, mockRecordSpend } = vi.hoisted(() => ({
  mockAnthropicCreate: vi.fn(),
  mockEnforceSpendCap: vi.fn(),
  mockLogger: {
    warn: vi.fn(),
  },
  mockRecordSpend: vi.fn(),
}));

vi.mock('@shopkeeper/agent/ai', () => ({
  anthropic: {
    messages: {
      create: mockAnthropicCreate,
    },
  },
}));

vi.mock('@shopkeeper/agent/spend', () => ({
  enforceSpendCap: mockEnforceSpendCap,
  recordSpend: mockRecordSpend,
}));

vi.mock('../logger.js', () => ({
  default: mockLogger,
}));

function memory(overrides: Partial<CustomerMemory> = {}): CustomerMemory {
  return {
    ...EMPTY_MEMORY,
    ...overrides,
    policyFlags: overrides.policyFlags ?? EMPTY_MEMORY.policyFlags,
    recentInteractions: overrides.recentInteractions ?? EMPTY_MEMORY.recentInteractions,
    keyFacts: overrides.keyFacts ?? EMPTY_MEMORY.keyFacts,
  };
}

function anthropicResponse(memoryPayload: CustomerMemory) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(memoryPayload) }],
    usage: {
      input_tokens: 123,
      output_tokens: 45,
      cache_creation_input_tokens: 10,
      cache_read_input_tokens: 20,
    },
  };
}

const customer = {
  id: 'customer-1',
  organizationId: 'org-1',
  name: 'Jane Smith',
  platformId: 'jane@example.com',
};

const closedThread = {
  id: 'thread-1',
  organizationId: 'org-1',
  customerId: 'customer-1',
  channelType: 'email',
  tag: 'Shipping',
  subject: 'Package is late',
  aiSummary: 'Customer complained that a shipment was late and asked for an ETA.',
  createdAt: '2026-05-25T10:00:00.000Z',
  updatedAt: '2026-05-26T12:00:00.000Z',
};

describe('summarizeCustomerMemory', () => {
  beforeEach(() => {
    mockAnthropicCreate.mockReset();
    mockEnforceSpendCap.mockReset().mockResolvedValue(undefined);
    mockLogger.warn.mockReset();
    mockRecordSpend.mockReset().mockResolvedValue(undefined);
  });

  it('calls Claude with structured output, records spend, and returns bounded memory', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(
      anthropicResponse(
        memory({
          summary: 'Shipping issue. '.repeat(80),
          keyFacts: [
            'Prefers email updates',
            'x'.repeat(90),
          ],
          policyFlags: { complaintPattern: false },
        }),
      ),
    );

    const result = await summarizeCustomerMemory({
      priorMemory: EMPTY_MEMORY,
      customer,
      closedThread,
      messages: [
        { id: 'm1', senderType: 'customer', contentText: 'My package is late again.', sentAt: '2026-05-25T10:00:00.000Z' },
        { id: 'm2', senderType: 'agent', contentText: 'We found the carrier delay.', sentAt: '2026-05-25T10:05:00.000Z' },
      ],
    });

    expect(result.summary).toHaveLength(SUMMARY_MAX_CHARS);
    expect(result.keyFacts).toEqual(['Prefers email updates']);
    expect(result.recentInteractions[0]).toEqual({
      threadId: 'thread-1',
      channel: 'email',
      tag: 'Shipping',
      closedAt: '2026-05-26T12:00:00.000Z',
      outcome: 'Customer complained that a shipment was late and asked for an ETA.',
    });

    expect(mockEnforceSpendCap).toHaveBeenCalledWith('org-1', null);
    expect(mockRecordSpend).toHaveBeenCalledWith(
      'org-1',
      {
        inputTokens: 123,
        outputTokens: 45,
        cacheCreationInputTokens: 10,
        cacheReadInputTokens: 20,
        totalTokens: 198,
      },
      MODEL.CUSTOMER_MEMORY,
    );

    const request = mockAnthropicCreate.mock.calls[0][0];
    expect(request.model).toBe(MODEL.CUSTOMER_MEMORY);
    expect(request.max_tokens).toBe(512);
    expect(request.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(request.output_config.format.type).toBe('json_schema');
  });

  it('caps input to the last 50 non-note, non-deleted messages in sent order', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(anthropicResponse(memory()));
    const messages = Array.from({ length: 55 }, (_, i) => ({
      id: `m${i}`,
      senderType: i % 2 === 0 ? 'customer' : 'agent',
      contentText: `message ${i}`,
      sentAt: new Date(Date.UTC(2026, 4, 26, 12, 0, i)).toISOString(),
    }));

    await summarizeCustomerMemory({
      priorMemory: EMPTY_MEMORY,
      customer,
      closedThread,
      messages: [
        { id: 'note-1', senderType: 'note', contentText: 'Internal note', sentAt: '2026-05-26T12:01:00.000Z' },
        { id: 'deleted-1', senderType: 'customer', contentText: 'Deleted', deletedAt: '2026-05-26T12:01:00.000Z' },
        ...messages,
      ],
    });

    const request = mockAnthropicCreate.mock.calls[0][0];
    const payload = JSON.parse(request.messages[0].content);
    expect(payload.messages).toHaveLength(50);
    expect(payload.messages[0].id).toBe('m5');
    expect(payload.messages[49].id).toBe('m54');
    expect(payload.messages.map((message: { id: string }) => message.id)).not.toContain('note-1');
    expect(payload.messages.map((message: { id: string }) => message.id)).not.toContain('deleted-1');
  });

  it('returns prior memory without calling Claude when the spend cap is reached', async () => {
    const prior = memory({ summary: 'Existing durable memory' });
    mockEnforceSpendCap.mockRejectedValueOnce(new SpendCapError(1_000, 1_000));

    const result = await summarizeCustomerMemory({
      priorMemory: prior,
      customer,
      closedThread,
      messages: [],
    });

    expect(result).toBe(prior);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockRecordSpend).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { organizationId: 'org-1', customerId: 'customer-1', threadId: 'thread-1' },
      '[Worker] Customer memory summarizer skipped — daily LLM spend cap reached',
    );
  });

  it('keeps the model-written outcome for the closed thread and moves it first', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(
      anthropicResponse(
        memory({
          recentInteractions: [
            {
              threadId: 'thread-old',
              channel: 'email',
              tag: 'Returns',
              closedAt: '2026-05-20T12:00:00.000Z',
              outcome: 'Resolved a return question.',
            },
            {
              threadId: 'thread-1',
              channel: 'email',
              tag: 'Shipping',
              closedAt: '2026-05-26T12:00:00.000Z',
              outcome: 'Shared tracking update and carrier delay context.',
            },
          ],
        }),
      ),
    );

    const result = await summarizeCustomerMemory({
      priorMemory: EMPTY_MEMORY,
      customer,
      closedThread,
      messages: [],
    });

    expect(result.recentInteractions.map((interaction) => interaction.threadId)).toEqual(['thread-1', 'thread-old']);
    expect(result.recentInteractions[0].outcome).toBe('Shared tracking update and carrier delay context.');
  });
});
