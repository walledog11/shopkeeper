import { del, put } from '@vercel/blob';
import { createHash, randomUUID } from 'crypto';
import {
  BLOB_ATTACHMENT_PREFIX,
  attachmentPathname,
  formatAttachmentRef,
  isBlockedAttachment,
  normalizeAttachmentContentType,
  sanitizeAttachmentName,
} from '@shopkeeper/agent/attachment-ref';
import { getInboundAttachmentLimits } from '../config/runtime-config.js';
import logger from '../logger.js';
import { decodedByteLength } from './attachment-budget.js';

export async function uploadOrgAttachment(
  organizationId: string,
  filename: string,
  contentType: string,
  base64Content: string,
  messageIdentity?: string | null,
): Promise<string | null> {
  const safeName = sanitizeAttachmentName(filename);
  const normalizedContentType = normalizeAttachmentContentType(contentType);
  const maxAttachmentBytes = getInboundAttachmentLimits().maxBytesEach;

  if (isBlockedAttachment(safeName, normalizedContentType)) {
    logger.warn(
      { organizationId, filename: safeName, contentType: normalizedContentType },
      '[Blob] Skipping blocked attachment',
    );
    return null;
  }

  const approxBytes = decodedByteLength(base64Content);
  if (approxBytes > maxAttachmentBytes) {
    logger.warn(
      { organizationId, filename: safeName, approxBytes },
      '[Blob] Skipping oversized attachment',
    );
    return null;
  }

  const buffer = Buffer.from(base64Content, 'base64');
  if (buffer.byteLength === 0) {
    logger.warn({ organizationId, filename: safeName }, '[Blob] Skipping empty attachment');
    return null;
  }
  if (buffer.byteLength > maxAttachmentBytes) {
    logger.warn(
      { organizationId, filename: safeName, byteLength: buffer.byteLength },
      '[Blob] Skipping oversized attachment',
    );
    return null;
  }

  const digest = messageIdentity
    ? createHash('sha256').update(organizationId).update('\0').update(messageIdentity).update('\0')
      .update(normalizedContentType).update('\0').update(buffer).digest('hex')
    : null;
  const blobId = digest ? `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}` : randomUUID();
  const pathname = attachmentPathname(organizationId, blobId, safeName);
  try {
    await put(pathname, buffer, {
      access: 'private',
      contentType: normalizedContentType,
      addRandomSuffix: false,
      ...(messageIdentity ? { allowOverwrite: true } : {}),
    });
    return formatAttachmentRef(pathname);
  } catch (err) {
    logger.error({ err, organizationId, filename: safeName }, '[Blob] Upload failed');
    return null;
  }
}

export async function deleteOrgAttachments(references: readonly string[]): Promise<void> {
  const pathnames = [...new Set(
    references
      .filter(reference => reference.startsWith(BLOB_ATTACHMENT_PREFIX))
      .map(reference => reference.slice(BLOB_ATTACHMENT_PREFIX.length))
      .filter(Boolean),
  )];
  if (pathnames.length === 0) return;
  await del(pathnames);
}
