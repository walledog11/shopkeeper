// Shared contract for the brand-voice learning loop.
//
// Corpus: `voice_edits` rows capture cases where the operator sent a customer
// reply that diverged from the agent's drafted reply (see VoiceEdit model).
// A daily gateway worker synthesizes accumulated edits into a proposed
// brandVoice update stored on `organizations.voice_proposal`; the dashboard
// renders it for approval. Both apps share the shape and thresholds here.

// Max length of a synthesized brief — must match the brandVoice settings field
// (Settings → Agent caps brand voice at 200 chars) so an approved proposal
// drops straight into that field.
export const BRAND_VOICE_MAX_CHARS = 200;

// A short, human-readable note on what the proposal changed and why.
export const VOICE_RATIONALE_MAX_CHARS = 300;

// Don't synthesize until at least this many unconsumed edits have accumulated —
// a handful of edits isn't a reliable signal of a voice trend.
export const VOICE_SYNTHESIS_MIN_EDITS = 5;

// Cap how many edits feed a single synthesis run, newest first.
export const VOICE_SYNTHESIS_MAX_EDITS = 30;

// Below this, a sent reply is too short to carry meaningful voice signal.
const VOICE_EDIT_MIN_FINAL_CHARS = 20;

export interface VoiceProposal {
  brief: string;        // proposed replacement for Organization.settings.brandVoice
  rationale: string;    // what the agent learned from the edits
  basedOnCount: number; // number of edits this proposal was synthesized from
  createdAt: string;    // ISO timestamp
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// Collapse whitespace + case so trivial reformatting doesn't read as an edit.
function normalizeReply(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

// True when the operator's sent reply carries brand-voice signal worth learning
// from: there was an AI draft, the operator sent something non-trivial, and it
// isn't just the draft re-sent verbatim (modulo whitespace/case).
export function isMeaningfulVoiceEdit(aiDraft: string | null | undefined, finalText: string): boolean {
  const draft = (aiDraft ?? '').trim();
  const final = finalText.trim();
  if (!draft || final.length < VOICE_EDIT_MIN_FINAL_CHARS) return false;
  return normalizeReply(draft) !== normalizeReply(final);
}

export function parseVoiceProposal(value: unknown): VoiceProposal | null {
  if (!isRecord(value)) return null;
  const { brief, rationale, basedOnCount, createdAt } = value;
  if (typeof brief !== 'string' || !brief.trim()) return null;
  if (typeof rationale !== 'string') return null;
  if (typeof basedOnCount !== 'number' || !Number.isFinite(basedOnCount)) return null;
  if (typeof createdAt !== 'string') return null;
  return {
    brief: brief.trim().slice(0, BRAND_VOICE_MAX_CHARS),
    rationale: rationale.trim().slice(0, VOICE_RATIONALE_MAX_CHARS),
    basedOnCount: Math.max(0, Math.floor(basedOnCount)),
    createdAt,
  };
}

export function boundVoiceProposal(proposal: VoiceProposal): VoiceProposal {
  return {
    brief: proposal.brief.trim().slice(0, BRAND_VOICE_MAX_CHARS),
    rationale: proposal.rationale.trim().slice(0, VOICE_RATIONALE_MAX_CHARS),
    basedOnCount: Math.max(0, Math.floor(proposal.basedOnCount)),
    createdAt: proposal.createdAt,
  };
}
