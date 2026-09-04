export const BLOB_ATTACHMENT_PREFIX = 'blob:';

// Keep the contract broad enough for merchant support workflows (including
// HEIC, Office documents and archives), but reject files that are directly
// executable by common desktop or scripting runtimes. Retained files are served
// with a separate passive-inline/download policy in the dashboard.
//
// Inbound and outbound share one denylist on purpose. A merchant-uploaded file
// is still served back through the same origin and still lands in a stranger's
// mailbox, so the two directions have the same exposure and a second copy of
// these rules would only drift.
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

export function sanitizeAttachmentName(filename: string): string {
  return filename.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'attachment';
}

export function normalizeAttachmentContentType(contentType: string | null | undefined): string {
  const mediaType = contentType?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mediaType)
    ? mediaType
    : 'application/octet-stream';
}

export function isBlockedAttachment(filename: string, contentType: string): boolean {
  const segments = filename.toLowerCase().split('.').slice(1);
  if (segments.some((seg) => BLOCKED_EXTENSIONS.has(seg))) return true;
  if (BLOCKED_CONTENT_TYPES.has(contentType)) return true;
  return false;
}

// The org segment is what `attachmentBelongsToOrg` authorizes against on read,
// so it is part of the storage contract rather than a naming convenience.
export function attachmentPathname(
  organizationId: string,
  uuid: string,
  safeName: string,
): string {
  return `attachments/${organizationId}/${uuid}/${safeName}`;
}

export function formatAttachmentRef(pathname: string): string {
  return `${BLOB_ATTACHMENT_PREFIX}${pathname}`;
}
