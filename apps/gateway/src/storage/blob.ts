import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { getInboundAttachmentLimits } from '../config/runtime-config.js';
import logger from '../logger.js';
import { decodedByteLength } from './attachment-budget.js';

export const BLOB_ATTACHMENT_PREFIX = 'blob:';

const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'scr', 'msi', 'com', 'vbs', 'js', 'jar',
]);

const BLOCKED_CONTENT_TYPES = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
]);

function isBlocked(filename: string, contentType: string): boolean {
  const segments = filename.toLowerCase().split('.').slice(1);
  if (segments.some((seg) => BLOCKED_EXTENSIONS.has(seg))) return true;
  if (BLOCKED_CONTENT_TYPES.has(contentType.toLowerCase())) return true;
  return false;
}

export async function uploadInboundAttachment(
  organizationId: string,
  filename: string,
  contentType: string,
  base64Content: string,
): Promise<string | null> {
  const safeName = filename.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'attachment';
  const maxAttachmentBytes = getInboundAttachmentLimits().maxBytesEach;

  if (isBlocked(safeName, contentType)) {
    logger.warn({ organizationId, filename: safeName, contentType }, '[Blob] Skipping blocked attachment');
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

  const pathname = `attachments/${organizationId}/${randomUUID()}/${safeName}`;
  try {
    await put(pathname, buffer, {
      access: 'private',
      contentType: contentType || 'application/octet-stream',
      addRandomSuffix: false,
    });
    return `${BLOB_ATTACHMENT_PREFIX}${pathname}`;
  } catch (err) {
    logger.error({ err, organizationId, filename: safeName }, '[Blob] Upload failed');
    return null;
  }
}
