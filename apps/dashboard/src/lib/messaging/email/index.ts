// Re-export shim — canonical source is @shopkeeper/email. Remove in Phase 5.
export type { EmailProvider, EmailSender, OutboundEmail, EmailHeader } from '@shopkeeper/email/types';
export { EmailNotConfiguredError } from '@shopkeeper/email/types';
export {
  getEmailProvider,
  getEmailProviderLabel,
  getEmailReauthorizePath,
  isEmailAuthReauthorizationRequired,
} from '@shopkeeper/email/providers';
export { getEmailSender } from '@shopkeeper/email/senders';
