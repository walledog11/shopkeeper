import { GmailApiError } from './errors.js';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*={0,2}$/;

export function decodeGmailBase64Url(value: string): Buffer {
  const unpadded = value.replace(/=+$/, '');
  const paddingLength = value.length - unpadded.length;
  const requiredPadding = (4 - (unpadded.length % 4)) % 4;
  if (
    !value
    || !BASE64URL_PATTERN.test(value)
    || unpadded.length % 4 === 1
    || (paddingLength > 0 && paddingLength !== requiredPadding)
  ) {
    throw new GmailApiError('Gmail returned invalid base64url data', {
      kind: 'invalid_response',
      status: null,
      operation: 'base64url.decode',
    });
  }

  return Buffer.from(unpadded, 'base64url');
}
