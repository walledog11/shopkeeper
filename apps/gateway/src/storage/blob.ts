import { del, put } from '@vercel/blob';
import { randomUUID } from 'crypto';
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

  const pathname = attachmentPathname(organizationId, randomUUID(), safeName);
  try {
    await put(pathname, buffer, {
      access: 'private',
      contentType: normalizedContentType,
      addRandomSuffix: false,
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
