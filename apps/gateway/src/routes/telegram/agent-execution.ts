import logger from '../../logger.js';
import { runOperatorFreeFormTurn } from '../../message-handlers/operator-free-form-turn.js';
import type { OperatorContext } from '../../operator-context.js';
import type { OperatorMessageContext } from '../operator-message.js';

// Messaging-transport wrapper around the shared operator turn: it delivers the
// summary as a message. The turn persists both sides of the exchange itself, so
// this delivery reply must stay raw (unmirrored).
export async function executeFreeFormInstruction(
  organizationId: string,
  clerkUserId: string,
  message: OperatorMessageContext,
  context: OperatorContext,
): Promise<void> {
  const { chatId, reply } = message;
  logger.info({ chatId, organizationId }, '[Operator] Free-form agent instruction');

  let summary: string;
  try {
    ({ summary } = await runOperatorFreeFormTurn({
      organizationId,
      clerkUserId,
      message,
      context,
    }));
  } catch (err) {
    logger.error({ err }, '[Operator] Operator agent turn failed (free-form)');
    await reply('Something went wrong running the agent. Please try again.');
    return;
  }
  await reply(summary || 'All set.');
}
