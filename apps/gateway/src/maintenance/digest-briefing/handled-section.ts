import { PLAN_STEP_LABELS } from '@shopkeeper/agent/tools';
import { customerFirstName } from '@shopkeeper/agent/person-name';
import { isRecord } from '../../lib/typing.js';
import { NOTABLE_HANDLED_LIMIT } from './constants.js';
import { capitalize, countWord } from './text.js';
import type { HandledRollup } from './types.js';

function extractRefundAmount(input: unknown): string | null {
  if (!isRecord(input)) return null;
  const amount = input.amount;
  if (typeof amount === 'number' && Number.isFinite(amount)) {
    return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
  }
  return null;
}

const IRREGULAR_PAST: Record<string, string> = { set: 'Set', put: 'Put' };

function pastTenseLabel(label: string): string {
  const [verb, ...rest] = label.split(' ');
  if (!verb) return label;
  const lower = verb.toLowerCase();
  const past = IRREGULAR_PAST[lower]
    ?? (lower.endsWith('e')
      ? `${verb}d`
      : /[^aeiou]y$/.test(lower)
        ? `${verb.slice(0, -1)}ied`
        : `${verb}ed`);
  return rest.length > 0 ? `${past} ${rest.join(' ')}` : past;
}

export function describeHandledExecution(execution: {
  mode: string | null;
  thread: { customer: { name: string | null } } | null;
  actions: Array<{ tool: string; input: unknown; status: string }>;
}): string | null {
  const firstName = customerFirstName(execution.thread?.customer?.name ?? null);
  const successfulActions = execution.actions.filter((action) => (
    action.status === 'success' || action.status === 'escalated'
  ));

  const refund = successfulActions.find((action) => action.tool === 'create_refund');
  if (refund) {
    const amount = extractRefundAmount(refund.input);
    if (firstName) return amount ? `Refunded ${firstName} ${amount}` : `Refunded ${firstName}`;
    return amount ? `Issued a ${amount} refund` : null;
  }

  if (successfulActions.some((action) => action.tool === 'send_reply' || action.tool === 'send_email')) {
    return firstName ? `Replied to ${firstName}` : null;
  }

  const primary = successfulActions.find((action) => action.tool !== 'add_internal_note');
  if (!primary) return null;
  const label = pastTenseLabel(PLAN_STEP_LABELS[primary.tool] ?? primary.tool.replace(/_/g, ' '));
  return firstName ? `${label} for ${firstName}` : label;
}

export function formatHandledSection(rollup: HandledRollup): string | null {
  const total = rollup.approvedCount + rollup.autoCount;
  if (total === 0) {
    return null;
  }

  if (total === 1 && rollup.notableLines.length <= 1) {
    const line = rollup.notableLines[0]
      ?? (rollup.replyCount === 1 ? 'sent one reply' : rollup.refundCount === 1 ? 'issued one refund' : null);
    if (line) {
      const sentence = `Since your last briefing I ${line.charAt(0).toLowerCase()}${line.slice(1)}.`;
      return rollup.autoCount === 1 ? `${sentence}\n\nThat one ran without needing you.` : sentence;
    }
  }

  const detailParts: string[] = [];
  if (rollup.refundCount > 0) {
    detailParts.push(`${countWord(rollup.refundCount)} refund${rollup.refundCount === 1 ? '' : 's'}`);
  }
  if (rollup.replyCount > 0) {
    detailParts.push(`${countWord(rollup.replyCount)} repl${rollup.replyCount === 1 ? 'y' : 'ies'}`);
  }
  const detail = detailParts.length > 0 ? `, including ${detailParts.join(' and ')}` : '';
  const lead = `Since your last briefing I handled ${countWord(total)} ${total === 1 ? 'thing' : 'things'}${detail}`;

  const lines = [rollup.notableLines.length > 0 ? `${lead}:` : `${lead}.`];
  if (rollup.notableLines.length > 0) {
    lines.push(...rollup.notableLines.map((line) => `- ${line}`));
  }
  if (rollup.autoCount > 0) {
    lines.push(``, rollup.autoCount === total
      ? `${total === 1 ? 'That one' : 'Those'} ran without needing you.`
      : `${capitalize(countWord(rollup.autoCount))} of those ran without needing you.`);
  }
  return lines.join('\n');
}

export { NOTABLE_HANDLED_LIMIT };
