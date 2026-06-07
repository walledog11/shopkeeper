import { describe, expect, it } from 'vitest';
import {
  attachmentBelongsToOrg,
  formatBlobAttachmentRef,
  isImageAttachmentRef,
  isImageAttachmentUrl,
  isManagedAttachmentRef,
  parseManagedAttachmentRef,
  toAttachmentDisplayUrl,
} from './blob-ref';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const PATHNAME = `attachments/${ORG_ID}/abc/photo.png`;

describe('blob attachment refs', () => {
  it('formats and parses blob refs', () => {
    const ref = formatBlobAttachmentRef(PATHNAME);
    expect(ref).toBe(`blob:${PATHNAME}`);
    expect(parseManagedAttachmentRef(ref)).toBe(PATHNAME);
    expect(isManagedAttachmentRef(ref)).toBe(true);
  });

  it('parses legacy Vercel blob URLs', () => {
    const legacyUrl = `https://abc123.public.blob.vercel-storage.com/${PATHNAME}`;
    expect(parseManagedAttachmentRef(legacyUrl)).toBe(PATHNAME);
    expect(isManagedAttachmentRef(legacyUrl)).toBe(true);
  });

  it('ignores non-managed URLs', () => {
    const externalUrl = 'https://cdn.example.com/photo.png';
    expect(parseManagedAttachmentRef(externalUrl)).toBeNull();
    expect(isManagedAttachmentRef(externalUrl)).toBe(false);
    expect(toAttachmentDisplayUrl(externalUrl)).toBe(externalUrl);
  });

  it('builds authenticated display URLs for managed refs', () => {
    const ref = formatBlobAttachmentRef(PATHNAME);
    expect(toAttachmentDisplayUrl(ref)).toBe(`/api/attachments?ref=${encodeURIComponent(ref)}`);
  });

  it('scopes attachments to the owning org', () => {
    expect(attachmentBelongsToOrg(PATHNAME, ORG_ID)).toBe(true);
    expect(attachmentBelongsToOrg(PATHNAME, '00000000-0000-0000-0000-000000000099')).toBe(false);
  });

  it('detects image attachments from refs and display URLs', () => {
    const ref = formatBlobAttachmentRef(PATHNAME);
    expect(isImageAttachmentRef(ref)).toBe(true);
    expect(isImageAttachmentRef(formatBlobAttachmentRef(`attachments/${ORG_ID}/abc/report.pdf`))).toBe(false);
    expect(isImageAttachmentUrl(toAttachmentDisplayUrl(ref))).toBe(true);
  });
});
