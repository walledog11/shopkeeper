import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { getInboundAttachmentLimits } from '../config/runtime-config.js';
import logger from '../logger.js';
import { decodedByteLength } from './attachment-budget.js';

export const BLOB_ATTACHMENT_PREFIX = 'blob:';

// Keep the inbound contract broad enough for merchant support workflows
// (including HEIC, Office documents and archives), but reject files that are
// directly executable by common desktop or scripting runtimes. Retained files
// are served with a separate passive-inline/download policy in the dashboard.
const BLOCKED_EXTENSIONS = new Set([
  'action',
  'app',
  'apk',
  'bat',
  'bash',
  'cmd',
  'com',
  'command',
  'cpl',
  'dll',
  'exe',
  'fish',
  'hta',
  'inf',
  'jar',
  'js',
  'jse',
  'lnk',
  'msi',
  'ps1',
  'reg',
  'scf',
  'scr',
  'sh',
  'vbs',
  'vbe',
  'ws',
  'wsf',
  'wsh',
  'zsh',
]);

const BLOCKED_CONTENT_TYPES = new Set([
  'application/java-archive',
  'application/javascript',
  'application/vnd.microsoft.portable-executable',
  'application/x-dosexec',
  'application/x-executable',
  'application/x-java-archive',
  'application/x-javascript',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-powershell',
  'application/x-sh',
  'application/x-sharedlib',
  'text/javascript',
  'text/x-shellscript',
]);

function isBlocked(filename: string, contentType: string): boolean {
  const segments = filename.toLowerCase().split('.').slice(1);
  if (segments.some((seg) => BLOCKED_EXTENSIONS.has(seg))) return true;
  if (BLOCKED_CONTENT_TYPES.has(contentType)) return true;
  return false;
}

function normalizeContentType(contentType: string): string {
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mediaType)
    ? mediaType
    : 'application/octet-stream';
}

export async function uploadInboundAttachment(
  organizationId: string,
  filename: string,
  contentType: string,
  base64Content: string,
): Promise<string | null> {
  const safeName = filename.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'attachment';
  const normalizedContentType = normalizeContentType(contentType);
  const maxAttachmentBytes = getInboundAttachmentLimits().maxBytesEach;

  if (isBlocked(safeName, normalizedContentType)) {
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

  const pathname = `attachments/${organizationId}/${randomUUID()}/${safeName}`;
  try {
    await put(pathname, buffer, {
      access: 'private',
      contentType: normalizedContentType,
      addRandomSuffix: false,
    });
    return `${BLOB_ATTACHMENT_PREFIX}${pathname}`;
  } catch (err) {
    logger.error({ err, organizationId, filename: safeName }, '[Blob] Upload failed');
    return null;
  }
}
