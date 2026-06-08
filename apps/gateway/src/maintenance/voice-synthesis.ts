import type Anthropic from '@anthropic-ai/sdk';
import {
  BRAND_VOICE_MAX_CHARS,
  VOICE_RATIONALE_MAX_CHARS,
  VOICE_SYNTHESIS_MAX_EDITS,
  VOICE_SYNTHESIS_MIN_EDITS,
  boundVoiceProposal,
  db,
  isSpendCapError,
  type VoiceProposal,
} from '@shopkeeper/db';
import { JOB, MODEL, QUEUE } from '../constants.js';
import logger from '../logger.js';
import { enforceSpendCap, recordSpend, type SpendCapSettings } from '@shopkeeper/agent/spend';
import { readModelUsage } from '@shopkeeper/agent/usage';
import { anthropic } from '@shopkeeper/agent/ai';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  ONE_DAY_MS,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

const MAX_OUTPUT_TOKENS = 512;
const MAX_EDIT_CHARS = 600;

export const VOICE_SYNTHESIS_SYSTEM_PROMPT = `You maintain the brand-voice brief for a Shopify store's customer-support AI.

You are given the store's current brief and recent examples where a human operator sent a customer reply that differed from the AI's drafted reply. The difference reveals how the operator actually wants replies to sound.

Produce an updated brief that captures the operator's consistent tone and style preferences.

Rules:
- The brief is reusable tone guidance for ALL future replies (e.g. "Warm but concise. Skip apologies. Sign off with 'Cheers'."), never a canned reply or example-specific text.
- Keep what the current brief already says unless the edits consistently contradict it. Refine, don't discard.
- Only encode patterns that recur across multiple edits. Ignore one-off, order-specific, or customer-specific wording.
- Never include customer names, order numbers, PII, or any content tied to a single ticket.
- If the edits show no consistent voice signal, return the current brief unchanged and say so in the rationale.
- brief: at most ${BRAND_VOICE_MAX_CHARS} characters.
- rationale: at most ${VOICE_RATIONALE_MAX_CHARS} characters, plainly explaining what you changed and why.`;

export const VOICE_SYNTHESIS_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    brief: {
      type: 'string',
      maxLength: BRAND_VOICE_MAX_CHARS,
      description: 'Updated reusable tone guidance for customer-facing replies.',
    },
    rationale: {
      type: 'string',
      maxLength: VOICE_RATIONALE_MAX_CHARS,
      description: 'What changed versus the current brief, and why.',
    },
  },
  required: ['brief', 'rationale'],
} as const;

export interface VoiceEditInput {
  aiDraft: string;
  finalText: string;
  tag?: string | null;
}

interface SynthesizedBrief {
  brief: string;
  rationale: string;
}

export interface SynthesizeVoiceBriefParams {
  organizationId: string;
  currentBrief: string;
  edits: VoiceEditInput[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readSpendSettings(settings: unknown): SpendCapSettings | null {
  if (!isRecord(settings)) return null;
  const raw = settings.dailyLLMSpendCapUsd;
  if (raw === null || typeof raw === 'number') {
    return { dailyLLMSpendCapUsd: raw };
  }
  return null;
}

function readBrandVoice(settings: unknown): string {
  if (!isRecord(settings)) return '';
  return typeof settings.brandVoice === 'string' ? settings.brandVoice.trim() : '';
}

function clip(text: string): string {
  return text.trim().slice(0, MAX_EDIT_CHARS);
}

function buildPayload(currentBrief: string, edits: VoiceEditInput[]): string {
  return JSON.stringify({
    currentBrief: currentBrief || '(none set yet)',
    edits: edits.map((edit) => ({
      tag: edit.tag ?? null,
      aiDraft: clip(edit.aiDraft),
      operatorSent: clip(edit.finalText),
    })),
  });
}

function parseSynthesizedBrief(value: unknown): SynthesizedBrief {
  if (!isRecord(value)) throw new Error('Voice synthesis response was not an object');
  if (typeof value.brief !== 'string' || !value.brief.trim()) throw new Error('Voice synthesis response missing brief');
  if (typeof value.rationale !== 'string') throw new Error('Voice synthesis response missing rationale');
  return { brief: value.brief, rationale: value.rationale };
}

export async function synthesizeVoiceBrief({
  organizationId,
  currentBrief,
  edits,
}: SynthesizeVoiceBriefParams): Promise<SynthesizedBrief> {
  const response = await anthropic.messages.create({
    model: MODEL.VOICE_SYNTHESIS,
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0,
    system: [{
      type: 'text',
      text: VOICE_SYNTHESIS_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: VOICE_SYNTHESIS_OUTPUT_SCHEMA,
      },
    },
    messages: [{
      role: 'user',
      content: buildPayload(currentBrief, edits),
    }],
  });

  await recordSpend(organizationId, readModelUsage(response), MODEL.VOICE_SYNTHESIS);

  const text = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')?.text;
  if (!text) throw new Error('Voice synthesis returned no JSON text');
  return parseSynthesizedBrief(JSON.parse(text));
}

export interface RunVoiceSynthesisResult {
  organizationsEligibleByEdits: number;
  proposalsCreated: number;
  organizationsSkippedForSpendCap: number;
  organizationsSkippedExistingProposal: number;
}

// Daily batch: for every org that has accumulated enough unconsumed voice edits
// and has no proposal already awaiting approval, synthesize a brand-voice
// proposal, store it on the org, and mark the consumed edits.
export async function runVoiceSynthesis(options: { now?: Date } = {}): Promise<RunVoiceSynthesisResult> {
  const now = options.now ?? new Date();
  const result: RunVoiceSynthesisResult = {
    organizationsEligibleByEdits: 0,
    proposalsCreated: 0,
    organizationsSkippedForSpendCap: 0,
    organizationsSkippedExistingProposal: 0,
  };

  const grouped = await db.voiceEdit.groupBy({
    by: ['organizationId'],
    where: { consumedAt: null },
    _count: { _all: true },
  });
  const eligibleOrgIds = grouped
    .filter((group) => group._count._all >= VOICE_SYNTHESIS_MIN_EDITS)
    .map((group) => group.organizationId);
  result.organizationsEligibleByEdits = eligibleOrgIds.length;

  for (const organizationId of eligibleOrgIds) {
    try {
      const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, settings: true, voiceProposal: true },
      });
      if (!org) continue;
      if (org.voiceProposal != null) {
        result.organizationsSkippedExistingProposal += 1;
        continue;
      }

      const spendSettings = readSpendSettings(org.settings);
      try {
        await enforceSpendCap(organizationId, spendSettings);
      } catch (err) {
        if (isSpendCapError(err)) {
          result.organizationsSkippedForSpendCap += 1;
          logger.warn({ organizationId }, '[VoiceSynthesis] Skipped — daily LLM spend cap reached');
          continue;
        }
        throw err;
      }

      const edits = await db.voiceEdit.findMany({
        where: { organizationId, consumedAt: null },
        orderBy: { createdAt: 'desc' },
        take: VOICE_SYNTHESIS_MAX_EDITS,
        select: { id: true, aiDraft: true, finalText: true, tag: true },
      });
      if (edits.length < VOICE_SYNTHESIS_MIN_EDITS) continue;

      const synthesized = await synthesizeVoiceBrief({
        organizationId,
        currentBrief: readBrandVoice(org.settings),
        edits,
      });

      const proposal: VoiceProposal = boundVoiceProposal({
        brief: synthesized.brief,
        rationale: synthesized.rationale,
        basedOnCount: edits.length,
        createdAt: now.toISOString(),
      });

      const consumedAt = new Date();
      await db.$transaction([
        db.organization.update({
          where: { id: organizationId },
          data: { voiceProposal: proposal as object },
        }),
        db.voiceEdit.updateMany({
          where: { id: { in: edits.map((edit) => edit.id) } },
          data: { consumedAt },
        }),
      ]);

      result.proposalsCreated += 1;
      logger.info({ organizationId, basedOn: edits.length }, '[VoiceSynthesis] Created brand-voice proposal');
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err), organizationId },
        '[VoiceSynthesis] Failed for organization',
      );
    }
  }

  return result;
}

export const registerVoiceSynthesisMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.VOICE_SYNTHESIS);
  await scheduleRepeatableJob(queue, JOB.VOICE_SYNTHESIS, JOB.VOICE_SYNTHESIS_ID, ONE_DAY_MS);

  const worker = createMaintenanceWorker(context, QUEUE.VOICE_SYNTHESIS, async () => {
    const result = await runVoiceSynthesis();
    logger.info(result, '[VoiceSynthesis] Daily brand-voice synthesis complete');
  }, {
    label: 'VoiceSynthesis',
    failureQueue: 'voice-synthesis',
  });

  return { workers: [worker], queues: [queue] };
};
