import { assessEmailInboundPaths } from '@shopkeeper/email/inbound-transport';
import type { Integration } from '@/types';

const INBOUND_VIA_GMAIL_LABEL = 'Inbound via Gmail';
const INBOUND_VIA_FORWARDING_LABEL = 'Inbound via forwarding';

export function assessWorkspaceEmailInbound(integrations: Integration[]) {
  return assessEmailInboundPaths(integrations);
}

export function dualInboundDeliveryMessage(assessment: ReturnType<typeof assessEmailInboundPaths>): string | null {
  if (!assessment.dualDeliveryRisk) return null;
  return `${INBOUND_VIA_GMAIL_LABEL} and ${INBOUND_VIA_FORWARDING_LABEL} are both active. `
    + 'Customer mail must use only one path — turn off Postmark forwarding in your mail provider '
    + 'or disconnect the Email (forwarding) integration.';
}

export function forwardingBlockedMessage(assessment: ReturnType<typeof assessEmailInboundPaths>): string | null {
  if (!assessment.gmailWatchReceiving) return null;
  return `This workspace already receives mail through ${INBOUND_VIA_GMAIL_LABEL}. `
    + 'Disconnect Gmail or disable Gmail sync before connecting forwarding.';
}
