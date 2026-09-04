import { get } from '@vercel/blob';
import { BLOB_ATTACHMENT_PREFIX } from '@shopkeeper/agent/attachment-ref';
import type { OutboundAttachment } from './types.js';

const ATTACHMENT_LOAD_TIMEOUT_MS = 10_000;

export class OutboundAttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundAttachmentError';
  }
}

export interface OutboundAttachmentLoadLimits {
  maxCount: number;
  maxTotalBytes: number;
}

export interface OutboundAttachmentLimits extends OutboundAttachmentLoadLimits {
  maxBytesEach: number;
}

// Deliberately tighter than the inbound budget, and read here rather than in
// each app's env module so the two send paths cannot enforce different numbers.
// Inbound drops an over-budget attachment and keeps the customer's message;
// outbound has no such fallback — the provider rejects the whole send, and
// `handleOutboundEmailJob` treats any post-request provider error as `unknown`
// and suppresses retry, so an oversized attachment strands the reply and pages
// ops. The ceiling is the smaller provider's: Postmark caps total message size
// at 10MB, and base64 transfer encoding inflates payload bytes by about a third.
const OUTBOUND_ATTACHMENT_DEFAULTS: OutboundAttachmentLimits = {
  maxCount: 5,
  maxBytesEach: 7_340_032,
  maxTotalBytes: 7_340_032,
};

function positiveInt(name: string, fallback: number, env: NodeJS.ProcessEnv): number {
  const raw = env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function getOutboundAttachmentLimits(
  env: NodeJS.ProcessEnv = process.env,
): OutboundAttachmentLimits {
  return {
    maxCount: positiveInt('OUTBOUND_ATTACHMENT_MAX_COUNT', OUTBOUND_ATTACHMENT_DEFAULTS.maxCount, env),
    maxBytesEach: positiveInt('OUTBOUND_ATTACHMENT_MAX_BYTES', OUTBOUND_ATTACHMENT_DEFAULTS.maxBytesEach, env),
    maxTotalBytes: positiveInt('OUTBOUND_ATTACHMENT_MAX_TOTAL_BYTES', OUTBOUND_ATTACHMENT_DEFAULTS.maxTotalBytes, env),
  };
}

function pathnameFor(ref: string): string | null {
  if (!ref.startsWith(BLOB_ATTACHMENT_PREFIX)) return null;
  const pathname = ref.slice(BLOB_ATTACHMENT_PREFIX.length);
  return pathname.length > 0 ? pathname : null;
}

async function readStreamWithinLimit(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Buffer | null> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }

  return byteLength > 0 ? Buffer.concat(chunks, byteLength) : null;
}

async function fetchBlob(pathname: string) {
  const options = { abortSignal: AbortSignal.timeout(ATTACHMENT_LOAD_TIMEOUT_MS) };

  const privateResult = await get(pathname, { ...options, access: 'private' });
  if (privateResult?.statusCode === 200 && privateResult.stream) return privateResult;

  // Inbound attachments predating private storage are still public, and a
  // merchant forwarding one back out is a normal support move.
  const publicResult = await get(pathname, { ...options, access: 'public' });
  if (publicResult?.statusCode === 200 && publicResult.stream) return publicResult;

  return null;
}

/**
 * Resolves stored `blob:` refs into the base64 payloads both senders take.
 *
 * This is the single owner of the outbound size ceiling. The composer shows the
 * same numbers for feedback, but only here are the byte counts read from
 * storage rather than reported by a caller — and only here is the check still
 * ahead of the provider request, where a refusal is a *definite* failure the
 * merchant can act on rather than the ambiguous `unknown` that suppresses retry.
 *
 * Every failure throws `OutboundAttachmentError`, so a caller can tell it apart
 * from a provider error and mark the send failed rather than unknown.
 */
export async function loadOutboundAttachments(
  refs: readonly string[],
  limits: OutboundAttachmentLoadLimits,
): Promise<OutboundAttachment[]> {
  if (refs.length === 0) return [];
  if (refs.length > limits.maxCount) {
    throw new OutboundAttachmentError(`Too many attachments — the limit is ${limits.maxCount}`);
  }

  const loaded: OutboundAttachment[] = [];
  let remainingBytes = limits.maxTotalBytes;

  for (const ref of refs) {
    const pathname = pathnameFor(ref);
    if (!pathname) {
      throw new OutboundAttachmentError('Attachment reference is not a stored attachment');
    }

    let result;
    try {
      result = await fetchBlob(pathname);
    } catch (err) {
      throw new OutboundAttachmentError(
        `Could not read attachment ${pathname}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!result) {
      throw new OutboundAttachmentError(`Attachment is no longer available: ${pathname}`);
    }

    const bytes = await readStreamWithinLimit(result.stream, remainingBytes);
    if (!bytes) {
      throw new OutboundAttachmentError(
        `Attachments total more than ${Math.floor(limits.maxTotalBytes / 1_048_576)}MB, which the email provider will reject`,
      );
    }
    remainingBytes -= bytes.byteLength;

    loaded.push({
      name: pathname.split('/').at(-1) ?? 'attachment',
      contentType: result.blob.contentType,
      contentBase64: bytes.toString('base64'),
    });
  }

  return loaded;
}
