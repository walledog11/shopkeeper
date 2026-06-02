import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, parseVoiceProposal } from '@clerk/db';
import { cleanupTestData, createTestOrg } from '@clerk/db/test-helpers';

const { mockAnthropicCreate, mockEnforceSpendCap, mockRecordSpend, mockLogger, mockCaptureException } = vi.hoisted(() => ({
  mockAnthropicCreate: vi.fn(),
  mockEnforceSpendCap: vi.fn(),
  mockRecordSpend: vi.fn(),
  mockLogger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  mockCaptureException: vi.fn(),
}));

vi.mock('../message-handlers/shared.js', () => ({
  getAnthropic: () => ({ messages: { create: mockAnthropicCreate } }),
}));

vi.mock('../llm-spend.js', () => ({
  enforceSpendCap: mockEnforceSpendCap,
  recordSpend: mockRecordSpend,
  readUsageFromAnthropic: () => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  }),
}));

vi.mock('../logger.js', () => ({ default: mockLogger }));
vi.mock('@sentry/node', () => ({ captureException: mockCaptureException }));

import { runVoiceSynthesis } from './voice-synthesis.js';

function anthropicReply(brief: string, rationale: string) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ brief, rationale }) }],
    usage: {},
  };
}

async function seedEdits(orgId: string, count: number) {
  await db.voiceEdit.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      organizationId: orgId,
      aiDraft: `We sincerely apologize for the inconvenience. (${i})`,
      finalText: `No worries — here's the fix. (${i})`,
      tag: 'Shipping',
    })),
  });
}

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  mockAnthropicCreate.mockReset();
  mockEnforceSpendCap.mockReset().mockResolvedValue(undefined);
  mockRecordSpend.mockReset().mockResolvedValue(undefined);
  mockCaptureException.mockReset();
  mockLogger.error.mockClear();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('runVoiceSynthesis', () => {
  it('creates a proposal and consumes edits for an eligible org', async () => {
    await seedEdits(org.id, 6);
    mockAnthropicCreate.mockResolvedValue(anthropicReply('Warm and direct. Skip apologies.', 'Operators consistently cut the apologies.'));

    const result = await runVoiceSynthesis({ now: new Date('2026-06-02T00:00:00.000Z') });

    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    expect(result.proposalsCreated).toBe(1);

    const reloaded = await db.organization.findUnique({ where: { id: org.id }, select: { voiceProposal: true } });
    const proposal = parseVoiceProposal(reloaded?.voiceProposal);
    expect(proposal?.brief).toBe('Warm and direct. Skip apologies.');
    expect(proposal?.basedOnCount).toBe(6);

    const unconsumed = await db.voiceEdit.count({ where: { organizationId: org.id, consumedAt: null } });
    expect(unconsumed).toBe(0);
  });

  it('skips orgs below the minimum edit threshold', async () => {
    await seedEdits(org.id, 3);

    const result = await runVoiceSynthesis();

    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(result.proposalsCreated).toBe(0);

    const reloaded = await db.organization.findUnique({ where: { id: org.id }, select: { voiceProposal: true } });
    expect(reloaded?.voiceProposal ?? null).toBeNull();
    const unconsumed = await db.voiceEdit.count({ where: { organizationId: org.id, consumedAt: null } });
    expect(unconsumed).toBe(3);
  });

  it('skips orgs that already have a pending proposal', async () => {
    await seedEdits(org.id, 6);
    await db.organization.update({
      where: { id: org.id },
      data: {
        voiceProposal: {
          brief: 'Existing brief',
          rationale: 'already pending',
          basedOnCount: 5,
          createdAt: '2026-06-01T00:00:00.000Z',
        } as object,
      },
    });

    const result = await runVoiceSynthesis();

    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(result.organizationsSkippedExistingProposal).toBeGreaterThanOrEqual(1);

    const reloaded = await db.organization.findUnique({ where: { id: org.id }, select: { voiceProposal: true } });
    expect(parseVoiceProposal(reloaded?.voiceProposal)?.brief).toBe('Existing brief');
    const unconsumed = await db.voiceEdit.count({ where: { organizationId: org.id, consumedAt: null } });
    expect(unconsumed).toBe(6);
  });
});
