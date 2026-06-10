export type {
  EmailProvider,
  EmailOAuthProvider,
  EmailHeader,
  OutboundEmail,
  EmailSender,
  EmailIntegrationLike,
  ParsedAttachment,
  ParsedEmail,
  NormalizedInboundEmail,
} from './types.js';
export { EmailNotConfiguredError } from './types.js';

export {
  getEmailProvider,
  getEmailProviderLabel,
  getEmailReauthorizePath,
  isEmailAuthReauthorizationRequired,
} from './providers.js';

export {
  getEmailSender,
  PostmarkSender,
  GmailSender,
  OutlookSender,
  type GmailIntegration,
  type OutlookIntegration,
} from './senders/index.js';

export { buildRawMime, buildMimeBase64 } from './mime-build.js';
export { parseMime } from './mime-parse.js';
export { normalizeInboundEmail } from './inbound-normalize.js';
export { isForSupportAddress } from './address-filter.js';
export { formatReplySubject, createThreadMessageId, buildThreadReplyHeaders } from './reply.js';

export {
  getEmailOAuthClient,
  requestTokenRefresh,
  persistRefreshedToken,
  type EmailOAuthClient,
  type RefreshedToken,
  type TokenRefreshResult,
} from './token.js';

export {
  installEmailLogger,
  getEmailLogger,
  type EmailLogger,
  type EmailLogFn,
  type EmailLogPayload,
} from './logger.js';
