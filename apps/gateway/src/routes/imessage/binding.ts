import { deleteOrgMemberBindToken, findOrgMemberBindToken, looksLikeOrgMemberBindToken, db } from '@shopkeeper/db';
import type { OrgMemberBindTokenPayload } from '@shopkeeper/db';
import {
  captureProductEvent,
  productEventInsertId,
} from '@shopkeeper/analytics';
import { resolveClerkUserApprover } from '../../clients/clerk-approver.js';
import logger from '../../logger.js';
import { finalizeOperatorBind } from '../../operator-onboarding.js';
import type { OperatorReply } from '../operator-message.js';

const CONNECT_INSTRUCTIONS =
  "This number isn't linked to a Shopkeeper workspace yet. Open your Shopkeeper dashboard " +
  'under Integrations → iMessage to get a connect code, then text it here.';

export interface ImessageBindingParams {
  senderId: string;
  spaceId: string;
  body: string;
  displayName: string | null;
  reply: OperatorReply;
  /** When the caller already resolved the token, skip a second DB lookup. */
  resolvedPayload?: OrgMemberBindTokenPayload;
}

// The merchant texts a single-use bind token to the iMessage line. iMessage has
// no Telegram-style `/start` deep link, so the raw token is the message body.
// Mirrors handleStartBinding: validate the token, resolve the OrgMember, upsert
// the binding. Until a sender is bound this way every inbound message is rejected
// with connect instructions — no ticket, no agent run. Never log connect tokens
// or raw message bodies at info/warn — only senderId, spaceId, orgId, and outcome metadata.
export async function handleImessageBinding(params: ImessageBindingParams): Promise<void> {
  const { senderId, spaceId, displayName, reply, resolvedPayload } = params;
  const token = params.body.trim();

  // Only a single opaque token is a binding attempt; anything else is a stranger.
  let payload = resolvedPayload ?? null;
  if (payload === null && token && looksLikeOrgMemberBindToken(token)) {
    payload = await findOrgMemberBindToken(token);
  }
  if (!payload) {
    logger.info(
      { senderId, spaceId, outcome: 'rejected_unbound' },
      '[iMessage] Bind rejected — sender not linked',
    );
    await reply(CONNECT_INSTRUCTIONS);
    return;
  }

  const member = await db.orgMember.findUnique({
    where: {
      organizationId_clerkUserId: {
        organizationId: payload.organizationId,
        clerkUserId: payload.clerkUserId,
      },
    },
  });

  if (!member) {
    logger.warn(
      { orgId: payload.organizationId, clerkUserId: payload.clerkUserId, senderId, outcome: 'failed_member_missing' },
      '[iMessage] Bind failed — OrgMember not found',
    );
    await reply('Could not link this number — your workspace membership is missing. Open the Shopkeeper dashboard and try again.');
    return;
  }

  // Spectrum inbound carries no display name; use Clerk member name when available.
  const clerkLabel = (await resolveClerkUserApprover(payload.clerkUserId))?.displayName ?? null;
  const bindingLabel = displayName ?? clerkLabel ?? senderId;

  // A sender handle binds to one member globally; texting a fresh token moves
  // the binding to whoever minted it.
  const binding = await db.orgMemberImessageBinding.upsert({
    where: { senderId },
    create: {
      orgMemberId: member.id,
      senderId,
      spaceId,
      displayName: bindingLabel,
    },
    update: {
      orgMemberId: member.id,
      spaceId,
      displayName: bindingLabel,
    },
  });

  await deleteOrgMemberBindToken(token);
  await captureProductEvent({
    event: 'integration_connection_completed',
    organizationId: payload.organizationId,
    source: 'gateway',
    platform: 'imessage',
    insertId: productEventInsertId.integrationConnectionCompleted(binding.id),
  });

  logger.info(
    { orgId: payload.organizationId, senderId, spaceId, bindingId: binding.id, outcome: 'success' },
    '[iMessage] Bind succeeded',
  );

  const welcome = await finalizeOperatorBind(payload.organizationId);
  await reply(welcome);
}
