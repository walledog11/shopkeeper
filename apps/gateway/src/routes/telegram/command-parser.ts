export type DigestCommand =
  | { type: 'digest-review' }
  | { type: 'digest-open'; index: number }
  | { type: 'digest-spam'; index: number }
  | { type: 'digest-reply'; index: number; text: string };

export type PendingPlanCommand =
  | { type: 'plan-run' }
  | { type: 'plan-dismiss' }
  | { type: 'plan-skip'; index: number };

export type TelegramCommand =
  | { type: 'start'; token: string | null }
  | { type: 'help' }
  | { type: 'summary' }
  | DigestCommand
  | PendingPlanCommand
  | { type: 'free-form'; instruction: string };

const DIGEST_COMMAND_TYPES = new Set(['digest-review', 'digest-open', 'digest-spam', 'digest-reply']);
const PENDING_PLAN_COMMAND_TYPES = new Set(['plan-run', 'plan-dismiss', 'plan-skip']);

export function isDigestCommand(command: { type: string }): command is DigestCommand {
  return DIGEST_COMMAND_TYPES.has(command.type);
}

export function isPendingPlanCommand(command: { type: string }): command is PendingPlanCommand {
  return PENDING_PLAN_COMMAND_TYPES.has(command.type);
}

function parseIndex(value: string): number | null {
  const index = Number(value);
  return Number.isSafeInteger(index) ? index : null;
}

export function parseTelegramCommand(body: string): TelegramCommand {
  const normalized = body.trim().toLowerCase();

  if (normalized.startsWith('/start')) {
    const startMatch = body.match(/^\/start\s+(\S+)/i);
    return { type: 'start', token: startMatch?.[1] ?? null };
  }

  if (normalized === 'help' || normalized === '/help') {
    return { type: 'help' };
  }
  if (normalized === 'summary' || normalized === 'status') {
    return { type: 'summary' };
  }
  if (normalized === 'review') {
    return { type: 'digest-review' };
  }
  if (normalized === 'run' || normalized === 'yes') {
    return { type: 'plan-run' };
  }
  if (normalized === 'dismiss' || normalized === 'no') {
    return { type: 'plan-dismiss' };
  }

  const openMatch = normalized.match(/^open\s+(\d+)$/);
  if (openMatch) {
    const index = parseIndex(openMatch[1]);
    if (index !== null) return { type: 'digest-open', index };
  }

  const spamMatch = normalized.match(/^spam\s+(\d+)$/);
  if (spamMatch) {
    const index = parseIndex(spamMatch[1]);
    if (index !== null) return { type: 'digest-spam', index };
  }

  const replyMatch = body.match(/^reply\s+(\d+)\s+([\s\S]*)$/i);
  if (replyMatch) {
    const index = parseIndex(replyMatch[1]);
    const text = replyMatch[2].trim();
    if (index !== null && text) return { type: 'digest-reply', index, text };
  }

  const skipMatch = normalized.match(/^skip\s+(\d+)$/);
  if (skipMatch) {
    const index = parseIndex(skipMatch[1]);
    if (index !== null) return { type: 'plan-skip', index };
  }

  // An order reference (`#1234`, `order 1234`) is no longer a deterministic
  // command — it flows to the agent, which resolves the order via tools.
  return { type: 'free-form', instruction: body };
}
