export {
  GmailApiClient,
  type GmailApiClientOptions,
  type GmailApiIntegration,
  type GmailHistoryListRequest,
  type GmailHistoryListResponse,
  type GmailHistoryRecord,
  type GmailHistoryType,
  type GmailLabelFilterBehavior,
  type GmailMessageAdded,
  type GmailMessageListRequest,
  type GmailMessageListResponse,
  type GmailMessageReference,
  type GmailRawMessage,
  type GmailWatchRequest,
  type GmailWatchResponse,
} from './client.js';
export { decodeGmailBase64Url } from './base64url.js';
export {
  GmailApiError,
  isGmailApiError,
  type GmailApiErrorKind,
  type GmailApiErrorOptions,
} from './errors.js';
