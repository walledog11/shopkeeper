import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import logger from '../logger.js';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

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

  if (isBlocked(safeName, contentType)) {
    logger.warn({ organizationId, filename: safeName, contentType }, '[Blob] Skipping blocked attachment');
    return null;
  }

  const approxBytes = Math.floor(base64Content.length * 3 / 4);
  if (approxBytes > MAX_ATTACHMENT_BYTES) {
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
  if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
    logger.warn(
      { organizationId, filename: safeName, byteLength: buffer.byteLength },
      '[Blob] Skipping oversized attachment',
    );
    return null;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    logger.error(
      { organizationId, filename: safeName },
      '[Blob] BLOB_READ_WRITE_TOKEN not set — cannot upload attachment',
    );
    return null;
  }

  const key = `attachments/${organizationId}/${randomUUID()}/${safeName}`;
  try {
    const result = await put(key, buffer, {
      access: 'public',
      contentType: contentType || 'application/octet-stream',
      addRandomSuffix: false,
    });
    logger.info(
      { organizationId, filename: safeName, byteLength: buffer.byteLength, url: result.url },
      '[Blob] Uploaded attachment',
    );
    return result.url;
  } catch (err) {
    logger.error({ err, organizationId, filename: safeName }, '[Blob] Upload failed');
    return null;
  }
}
