// Re-export shim — canonical source is @shopkeeper/email. Remove in Phase 5.
export {
  getEmailProvider,
  getEmailProviderLabel,
  getEmailReauthorizePath,
  isEmailAuthReauthorizationRequired,
} from '@shopkeeper/email/providers';
