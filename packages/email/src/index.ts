export type {
  EmailProvider,
  EmailOAuthProvider,
  EmailHeader,
  OutboundEmail,
  EmailSendResult,
  EmailSender,
  EmailIntegrationLike,
  ParsedAttachment,
  ParsedEmail,
  NormalizedInboundEmail,
} from './types.js';
export { EmailNotConfiguredError } from './types.js';

export {
  EmailIntegrationConfigurationError,
  resolveEmailIntegration,
  type EmailIntegrationPurpose,
  type ResolveEmailIntegrationInput,
} from './integration-resolution.js';

export {
  GMAIL_READONLY_SCOPE,
  getEmailAuthReauthorizationReason,
  getGmailInboundStatus,
  getGmailLastSyncedAt,
  getGmailWatchFailureCount,
  getEmailProvider,
  getEmailProviderLabel,
  getEmailReauthorizePath,
  isEmailAuthReauthorizationRequired,
  isGmailNativeInboundEnrolled,
  isPersonalGmailAddress,
  resolveGmailAccountType,
  getGmailAccountType,
  type EmailAuthReauthorizationReason,
  type GmailAccountType,
  type GmailInboundStatus,
} from './providers.js';

export {
  getEmailSender,
  PostmarkSender,
  GmailSender,
  type GmailIntegration,
} from './senders/index.js';

export { buildRawMime, buildMimeBase64 } from './mime-build.js';
export { parseMime } from './mime-parse.js';
export { normalizeInboundEmail } from './inbound-normalize.js';
export { isForSupportAddress } from './address-filter.js';
export {
  formatReplySubject,
  createThreadMessageId,
  createOutboundMessageId,
  buildThreadReplyHeaders,
  buildOutboundMessageReplyHeaders,
} from './reply.js';

export {
  getEmailOAuthClient,
  requestTokenRefresh,
  persistRefreshedToken,
  type EmailOAuthClient,
  type RefreshedToken,
  type TokenRefreshResult,
} from './token.js';

export * from './gmail/index.js';

export {
  installEmailLogger,
  getEmailLogger,
  type EmailLogger,
  type EmailLogFn,
  type EmailLogPayload,
} from './logger.js';
