import type { FollowUpWatchKind } from '@shopkeeper/db';
import { listOperatorBindings, notifyOperator } from '../operator-notify.js';

export function postResolutionFollowUpIdempotencyKey(
  organizationId: string,
  orderId: string,
  kind: FollowUpWatchKind,
): string {
  return `post-resolution-followup:${organizationId}:${orderId}:${kind}`;
}

export interface FollowUpNudge {
  id: string;
  orderId: string;
  kind: FollowUpWatchKind;
  customerName: string | null;
  daysAgo: number;
}

function kindNoun(kind: FollowUpWatchKind): string {
  return kind === 'exchange' ? 'exchange' : 'refund';
}

function agoPhrase(daysAgo: number): string {
  if (daysAgo <= 1) return 'yesterday';
  return `${daysAgo} days ago`;
}

// Operator-facing nudge. Notify-only by design (B5, nudge variant): it points at
// the closed ticket and leans on the conversational operator loop to draft the
// actual check-in, rather than pre-generating a customer reply.
export function buildFollowUpNudgeMessage(nudge: Pick<FollowUpNudge, 'orderId' | 'kind' | 'customerName' | 'daysAgo'>): string {
  const firstName = nudge.customerName?.split(' ')[0]?.trim() || null;
  const noun = kindNoun(nudge.kind);
  const when = agoPhrase(nudge.daysAgo);
  if (firstName) {
    return `Worth a quick check-in? ${firstName}'s ${noun} on order ${nudge.orderId} wrapped up ${when}. `
      + `Reply "reply to ${firstName}: …" and I'll draft the message.`;
  }
  return `Worth a quick check-in? A ${noun} on order ${nudge.orderId} wrapped up ${when}. `
    + `Open that ticket and I'll draft a note to the customer.`;
}

export async function pushFollowUpNudge(
  organizationId: string,
  nudge: FollowUpNudge,
): Promise<'notified' | 'skipped'> {
  const bindings = await listOperatorBindings(organizationId);
  if (bindings.length === 0) {
    return 'skipped';
  }

  const message = buildFollowUpNudgeMessage(nudge);
  const idempotencyKey = postResolutionFollowUpIdempotencyKey(organizationId, nudge.orderId, nudge.kind);
  let notified = 0;
  for (const member of bindings) {
    const result = await notifyOperator(organizationId, member, message, {}, { idempotencyKey });
    if (result) notified += 1;
  }
  return notified > 0 ? 'notified' : 'skipped';
}
