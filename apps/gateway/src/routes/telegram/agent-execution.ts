import logger from '../../logger.js';
import { renderOperatorLedger } from '../../message-handlers/operator-ledger.js';
import { buildOperatorSessionTools } from '../../message-handlers/operator-session-tools.js';
import { buildOperatorInboxTools } from '../../message-handlers/operator-inbox-tools.js';
import { executeOperatorAgentTurn } from '../../message-handlers/execute-operator-agent-turn.js';
import type { OperatorContext } from '../../operator-context.js';
import type { OperatorMessageContext } from '../operator-message.js';

export async function executeFreeFormInstruction(
  organizationId: string,
  clerkUserId: string,
  message: OperatorMessageContext,
  context: OperatorContext,
): Promise<void> {
  const { chatId, body, reply, presence, senderRef } = message;
  logger.info({ chatId, organizationId }, '[Operator] Free-form agent instruction');

  // The model interprets the merchant's message against the pending-state ledger
  // and drives any state transition through the control tools (approve/reject/
  // revise/answer). The turn runs on the merchant's durable operator thread and
  // resolves order references via tools from the text. It persists both sides of
  // the exchange, so this delivery reply must stay raw (unmirrored).
  const operatorLedger = await renderOperatorLedger(organizationId, context);
  const moduleTools = {
    ...buildOperatorSessionTools({
      organizationId,
      clerkUserId,
      chatId,
      senderRef,
      context,
    }),
    ...buildOperatorInboxTools({ organizationId }),
  };

  let summary: string;
  try {
    ({ summary } = await presence(
      { kind: 'free-form', instruction: body },
      () => executeOperatorAgentTurn({
        orgId: organizationId,
        instruction: body,
        operatorKey: senderRef,
        senderPhone: senderRef,
        clerkUserId,
        operatorLedger,
        moduleTools,
      }),
    ));
  } catch (err) {
    logger.error({ err }, '[Operator] Operator agent turn failed (free-form)');
    await reply('Something went wrong running the agent. Please try again.');
    return;
  }
  await reply(summary || 'All set.');
}
