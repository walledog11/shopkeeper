export const DEFAULT_LIFECYCLE_STALE_CLAIM_MS = 5 * 60 * 1000;

const MAX_LIFECYCLE_ERROR_LENGTH = 4_000;

export function lifecycleErrorDetail(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.slice(0, MAX_LIFECYCLE_ERROR_LENGTH);
}
