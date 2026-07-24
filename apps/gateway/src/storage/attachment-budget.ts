import { getInboundAttachmentLimits } from '../config/runtime-config.js';

export interface InboundAttachment {
  name: string;
  contentType: string;
  contentBase64: string;
}

export type AttachmentRejectionReason = 'count' | 'too_large' | 'total_size';

export interface AttachmentBudgetResult {
  accepted: InboundAttachment[];
  rejected: Array<{ name: string; reason: AttachmentRejectionReason; bytes: number }>;
}

export function decodedByteLength(base64Content: string): number {
  const padding = base64Content.endsWith('==') ? 2 : base64Content.endsWith('=') ? 1 : 0;
  return Math.max(Math.floor((base64Content.length * 3) / 4) - padding, 0);
}

// Applied at ingestion, before anything is queued or uploaded: an over-budget
// attachment is dropped, never the customer's message. A support ticket that
// arrives without its photo is recoverable; one that never arrives is not.
export function applyInboundAttachmentBudget(candidates: InboundAttachment[]): AttachmentBudgetResult {
  const { maxCount, maxBytesEach, maxTotalBytes } = getInboundAttachmentLimits();
  const accepted: InboundAttachment[] = [];
  const rejected: AttachmentBudgetResult['rejected'] = [];
  let totalBytes = 0;

  for (const candidate of candidates) {
    const bytes = decodedByteLength(candidate.contentBase64);

    if (accepted.length >= maxCount) {
      rejected.push({ name: candidate.name, reason: 'count', bytes });
      continue;
    }
    if (bytes > maxBytesEach) {
      rejected.push({ name: candidate.name, reason: 'too_large', bytes });
      continue;
    }
    if (totalBytes + bytes > maxTotalBytes) {
      rejected.push({ name: candidate.name, reason: 'total_size', bytes });
      continue;
    }

    accepted.push(candidate);
    totalBytes += bytes;
  }

  return { accepted, rejected };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
}
