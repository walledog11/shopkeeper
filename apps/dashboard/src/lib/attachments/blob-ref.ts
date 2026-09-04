import {
  BLOB_ATTACHMENT_PREFIX,
  formatAttachmentRef,
} from '@shopkeeper/agent/attachment-ref';

const VERCEL_BLOB_HOST_SUFFIX = '.blob.vercel-storage.com';

export const formatBlobAttachmentRef = formatAttachmentRef;

export function parseManagedAttachmentRef(ref: string): string | null {
  if (ref.startsWith(BLOB_ATTACHMENT_PREFIX)) {
    return ref.slice(BLOB_ATTACHMENT_PREFIX.length);
  }

  try {
    const url = new URL(ref);
    if (url.hostname.endsWith(VERCEL_BLOB_HOST_SUFFIX)) {
      const pathname = url.pathname.replace(/^\/+/, '');
      return pathname.length > 0 ? pathname : null;
    }
  } catch {
    return null;
  }

  return null;
}

export function isManagedAttachmentRef(ref: string): boolean {
  return parseManagedAttachmentRef(ref) !== null;
}

export function attachmentBelongsToOrg(pathname: string, organizationId: string): boolean {
  return pathname.startsWith(`attachments/${organizationId}/`);
}

// A ref arriving on a send request is client-supplied. Reuse the same org
// segment the read route authorizes against, so a merchant cannot attach
// another workspace's blob to their own outgoing message.
export function isOwnedAttachmentRef(ref: string, organizationId: string): boolean {
  const pathname = parseManagedAttachmentRef(ref);
  return pathname !== null && attachmentBelongsToOrg(pathname, organizationId);
}

export function attachmentFilename(pathname: string): string {
  return pathname.split('/').at(-1) ?? 'attachment';
}

export function toAttachmentDisplayUrl(ref: string): string {
  if (isManagedAttachmentRef(ref)) {
    return `/api/attachments?ref=${encodeURIComponent(ref)}`;
  }
  return ref;
}

export function isImageAttachmentRef(ref: string): boolean {
  if (isManagedAttachmentRef(ref)) {
    const pathname = parseManagedAttachmentRef(ref);
    return pathname ? /\.(jpg|jpeg|png|gif|webp)$/i.test(pathname) : false;
  }
  return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(ref);
}

export function isImageAttachmentUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'http://localhost');
    if (parsed.pathname === '/api/attachments') {
      const ref = parsed.searchParams.get('ref');
      return ref ? isImageAttachmentRef(ref) : false;
    }
  } catch {
    // Fall through to direct URL matching.
  }
  return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
}
