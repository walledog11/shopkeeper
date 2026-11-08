import { createFetchWithDeadline, RequestTimeoutError } from '@shopkeeper/shared/http-deadline';

export class ExternalRequestTimeoutError extends RequestTimeoutError {
  override name = 'ExternalRequestTimeoutError';
}

export const fetchWithDeadline = createFetchWithDeadline(ExternalRequestTimeoutError);
