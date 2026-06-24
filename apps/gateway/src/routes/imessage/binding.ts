import { deleteOrgMemberBindToken, findOrgMemberBindToken, db } from '@shopkeeper/db';
import logger from '../../logger.js';
import type { OperatorReply } from '../operator-message.js';

const CONNECT_INSTRUCTIONS =
  "This number isn't linked to a Shopkeeper workspace yet. Open your Shopkeeper dashboard " +
  'under Integrations → iMessage to get a connect code, then text it here.';

export interface ImessageBindingParams {
  integrationId: string;
  senderId: string;
  spaceId: string;
  body: string;
  displayName: string | null;
  reply: OperatorReply;
}

// The merchant texts a single-use bind token to the iMessage line. iMessage has
// no Telegram-style `/start` deep link, so the raw token is the message body.
// Mirrors handleStartBinding: validate the token, resolve the OrgMember, upsert
// the binding, then consume the token. Until a sender is bound this way every
// inbound message is rejected with connect instructions — no ticket, no agent run.
export async function handleImessageBinding(params: ImessageBindingParams): Promise<void> {
  const { integrationId, senderId, spaceId, displayName, reply } = params;
  const token = params.body.trim();

  // Only a single opaque token is a binding attempt; anything else is a stranger.
  const payload = token && !/\s/.test(token) ? await findOrgMemberBindToken(token) : null;
  if (!payload) {
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
      { orgId: payload.organizationId, clerkUserId: payload.clerkUserId },
      '[iMessage] Bind target OrgMember not found',
    );
    await reply('Could not link this number — your workspace membership is missing. Open the Shopkeeper dashboard and try again.');
    return;
  }

  // A given (integration, sender) binds to one member; texting a fresh token
  // moves the binding to whoever minted it.
  await db.orgMemberImessageBinding.upsert({
    where: { integrationId_senderId: { integrationId, senderId } },
    create: {
      orgMemberId: member.id,
      integrationId,
      senderId,
      spaceId,
      displayName,
    },
    update: {
      orgMemberId: member.id,
      spaceId,
      displayName,
    },
  });

  await deleteOrgMemberBindToken(token);

  await reply("Connected. Text SUMMARY for your inbox or HELP for commands. You can also send instructions like 'refund #1234'.");
}
