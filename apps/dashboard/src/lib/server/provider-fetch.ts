import { createFetchWithDeadline, RequestTimeoutError } from '@shopkeeper/shared/http-deadline';

export class ProviderRequestTimeoutError extends RequestTimeoutError {
  override name = 'ProviderRequestTimeoutError';
}

export function isProviderRequestTimeoutError(error: unknown): error is ProviderRequestTimeoutError {
  return error instanceof ProviderRequestTimeoutError;
}

export const fetchProviderWithDeadline = createFetchWithDeadline(ProviderRequestTimeoutError);
