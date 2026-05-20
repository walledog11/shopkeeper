import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const VERSION_PREFIX = 'enc:v1:';
const DEV_FALLBACK_KEY_SOURCE = 'clerk-dev-only-token-encryption-key-do-not-use-in-prod';

let cachedKey: Buffer | null = null;
let warnedMissing = false;

function deriveDevFallbackKey(): Buffer {
  const buf = Buffer.alloc(32);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = DEV_FALLBACK_KEY_SOURCE.charCodeAt(i % DEV_FALLBACK_KEY_SOURCE.length);
  }
  return buf;
}

function parseKey(raw: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const base64 = Buffer.from(raw, 'base64');
  if (base64.length === 32) return base64;
  return Buffer.from(raw, 'utf8');
}

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (raw) {
    const key = parseKey(raw);
    if (key.length !== 32) {
      throw new Error('[crypto] TOKEN_ENCRYPTION_KEY must decode to 32 bytes (hex64, base64, or 32 raw chars)');
    }
    cachedKey = key;
    return cachedKey;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[crypto] TOKEN_ENCRYPTION_KEY is required in production');
  }
  if (!warnedMissing) {
    warnedMissing = true;
    console.warn('[crypto] TOKEN_ENCRYPTION_KEY not set — using insecure dev fallback. Set this env var before production.');
  }
  cachedKey = deriveDevFallbackKey();
  return cachedKey;
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(VERSION_PREFIX);
}

export function encryptToken(plain: string | null | undefined): string | null {
  if (plain == null) return null;
  if (typeof plain !== 'string' || plain === '') return null;
  if (isEncrypted(plain)) return plain;
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([ciphertext, tag]).toString('base64');
  return `${VERSION_PREFIX}${iv.toString('base64')}:${payload}`;
}

export function decryptToken(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  if (typeof stored !== 'string' || stored === '') return null;
  if (!isEncrypted(stored)) return stored;
  const parts = stored.slice(VERSION_PREFIX.length).split(':');
  if (parts.length !== 2) return null;
  try {
    const iv = Buffer.from(parts[0], 'base64');
    const buf = Buffer.from(parts[1], 'base64');
    if (iv.length !== IV_LENGTH || buf.length < TAG_LENGTH) return null;
    const tag = buf.subarray(buf.length - TAG_LENGTH);
    const data = buf.subarray(0, buf.length - TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, loadKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}

export function resetCryptoKeyCacheForTests(): void {
  cachedKey = null;
  warnedMissing = false;
}
