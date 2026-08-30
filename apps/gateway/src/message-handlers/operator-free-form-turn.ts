import { renderOperatorLedger } from './operator-ledger.js';
import { buildOperatorSessionTools } from './operator-session-tools.js';
import { buildOperatorInboxTools } from './operator-inbox-tools.js';
import { buildOperatorActionHistoryTools } from './operator-action-history-tools.js';
import { buildOperatorDigestTools } from './operator-digest-tools.js';
import { buildOperatorProductHelpTools } from './operator-product-help-tools.js';
import { buildOperatorShopTools } from './operator-shop-tools.js';
import { buildOperatorDashboardNavTools } from './operator-dashboard-nav-tools.js';
import {
  executeOperatorAgentTurn,
  type ExecuteOperatorAgentTurnResult,
} from './execute-operator-agent-turn.js';
import type { OperatorContext } from '../operator-context.js';
import type { OperatorMessageContext } from '../routes/operator-message.js';

export interface RunOperatorFreeFormTurnParams {
  organizationId: string;
  clerkUserId: string;
  message: OperatorMessageContext;
  context: OperatorContext;
}

// One operator turn, transport-agnostic. The model interprets the merchant's
// message against the pending-state ledger and drives any state transition
// through the control tools (approve/reject/revise/answer). Every transport lands
// on the merchant's one durable operator thread — resolved from `senderRef`, the
// member key — so the desk and the phone continue the same conversation. The turn
// resolves order references via tools from the text and persists both sides of the
// exchange, so callers must deliver the returned summary raw (unmirrored).
export async function runOperatorFreeFormTurn(
  params: RunOperatorFreeFormTurnParams,
): Promise<ExecuteOperatorAgentTurnResult> {
  const { organizationId, clerkUserId, context } = params;
  const { body, presence, senderRef, deliveryRef, turnId } = params.message;
  const deskMode = !deliveryRef;

  // No delivery ref means no provider push: the merchant is at the dashboard,
  // where a pending plan is a button rather than a line to reply to.
  const operatorLedger = await renderOperatorLedger(
    organizationId,
    context,
    deliveryRef ? 'messaging' : 'desk',
  );
  const moduleTools = {
    ...buildOperatorSessionTools({
      organizationId,
      clerkUserId,
      memberKey: senderRef,
      ...(deliveryRef ? { deliveryRef } : {}),
      context,
    }),
    ...buildOperatorInboxTools({ organizationId }),
    ...buildOperatorActionHistoryTools({ organizationId }),
    ...buildOperatorDigestTools({ organizationId, context }),
    ...buildOperatorProductHelpTools(),
    ...buildOperatorShopTools({ organizationId }),
    ...(deskMode ? buildOperatorDashboardNavTools() : {}),
  };

  return presence(
    { kind: 'free-form', instruction: body },
    () => executeOperatorAgentTurn({
      orgId: organizationId,
      instruction: body,
      ...(turnId ? { turnId } : {}),
      operatorKey: senderRef,
      ...(deliveryRef ? { senderPhone: deliveryRef } : {}),
      clerkUserId,
      operatorLedger,
      operatorDeskMode: deskMode,
      moduleTools,
    }),
  );
}
