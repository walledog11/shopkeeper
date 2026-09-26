import { isGmailWatchReceivingConfigured } from './inbound-transport.js';

export type EmailInboundSiblingIntegration = {
  emailProvider?: 'gmail' | 'postmark' | null;
  lifecycleStatus?: string;
  metadata?: unknown | null;
};

const DUAL_INBOUND_MESSAGE =
  'This workspace cannot receive mail through Gmail sync and email forwarding at the same time. '
  + 'Disconnect the other inbound path first.';

/** Mirrors packages/db email-inbound-transport-audit dualDeliveryRisk (no env flags). */
export function hasDualInboundDeliveryRisk(input: {
  gmail: EmailInboundSiblingIntegration | null;
  postmark: EmailInboundSiblingIntegration | null;
}): boolean {
  const gmailActive = input.gmail?.lifecycleStatus === 'active';
  const postmarkActive = input.postmark?.lifecycleStatus === 'active';
  if (!gmailActive || !postmarkActive || !input.gmail) return false;
  return isGmailWatchReceivingConfigured(input.gmail);
}

export function assertNoDualInboundDelivery(input: {
  gmail: EmailInboundSiblingIntegration | null;
  postmark: EmailInboundSiblingIntegration | null;
}): void {
  if (hasDualInboundDeliveryRisk(input)) {
    throw new Error(DUAL_INBOUND_MESSAGE);
  }
}

export { DUAL_INBOUND_MESSAGE };
