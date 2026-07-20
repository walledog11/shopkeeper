import { createHash } from 'node:crypto';
import logger from '@/lib/server/logger';
import { rateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 16 * 1_024;
const MAX_REPORTS_PER_REQUEST = 5;
const RATE_LIMIT_PER_MINUTE = 30;
const CSP_CONTENT_TYPES = new Set([
  'application/csp-report',
  'application/json',
  'application/reports+json',
]);

export interface SanitizedCspViolation {
  blockedResource: string;
  disposition: string | null;
  documentOrigin: string | null;
  effectiveDirective: string;
  sourceOrigin: string | null;
  statusCode: number | null;
  violatedDirective: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, ...names: string[]): string | null {
  for (const name of names) {
    if (typeof record[name] === 'string') return record[name];
  }
  return null;
}

function normalizedToken(value: string | null): string | null {
  if (!value) return null;
  const token = value.trim().toLowerCase();
  return /^[a-z][a-z0-9-]{0,63}$/.test(token) ? token : null;
}

function safeOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === 'null' ? `${url.protocol}` : url.origin;
  } catch {
    return null;
  }
}

function safeBlockedResource(value: string | null): string {
  if (!value) return 'unknown';
  const special = value.trim().toLowerCase();
  if (['inline', 'eval', 'self', 'none'].includes(special)) return special;
  if (special.startsWith('data:')) return 'data:';
  if (special.startsWith('blob:')) return 'blob:';
  return safeOrigin(value) ?? 'redacted';
}

function statusCode(record: Record<string, unknown>): number | null {
  const value = record['status-code'] ?? record.statusCode;
  return Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599
    ? Number(value)
    : null;
}

function normalizeViolation(value: unknown): SanitizedCspViolation | null {
  if (!isRecord(value)) return null;

  const legacyBody = value['csp-report'];
  const reportBody = value.type === 'csp-violation' ? value.body : undefined;
  const body = isRecord(legacyBody)
    ? legacyBody
    : isRecord(reportBody)
      ? reportBody
      : value;

  const effectiveDirective = normalizedToken(stringField(
    body,
    'effective-directive',
    'effectiveDirective',
  ));
  if (!effectiveDirective) return null;

  return {
    blockedResource: safeBlockedResource(stringField(body, 'blocked-uri', 'blockedURL')),
    disposition: normalizedToken(stringField(body, 'disposition')),
    documentOrigin: safeOrigin(stringField(body, 'document-uri', 'documentURL')),
    effectiveDirective,
    sourceOrigin: safeOrigin(stringField(body, 'source-file', 'sourceFile')),
    statusCode: statusCode(body),
    violatedDirective: normalizedToken(stringField(
      body,
      'violated-directive',
      'violatedDirective',
    )),
  };
}

export function parseCspViolations(value: unknown): SanitizedCspViolation[] {
  const reports = Array.isArray(value) ? value : [value];
  return reports
    .slice(0, MAX_REPORTS_PER_REQUEST)
    .map(normalizeViolation)
    .filter((report): report is SanitizedCspViolation => report !== null);
}

function requestFingerprint(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const address = forwardedFor || request.headers.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(address).digest('hex').slice(0, 16);
}

function emptyResponse(status: number): Response {
  return new Response(null, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function readBodyWithinLimit(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (!contentType || !CSP_CONTENT_TYPES.has(contentType)) return emptyResponse(415);

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return emptyResponse(413);
  }

  const limit = await rateLimit(
    `csp-report:${requestFingerprint(request)}`,
    RATE_LIMIT_PER_MINUTE,
    60,
  );
  if (!limit.success) return emptyResponse(204);

  const rawBody = await readBodyWithinLimit(request, MAX_BODY_BYTES);
  if (rawBody === null) return emptyResponse(413);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    return emptyResponse(400);
  }

  const violations = parseCspViolations(parsed);
  if (violations.length === 0) return emptyResponse(400);

  logger.warn(
    { reportCount: violations.length, violations },
    '[CSP] Browser policy violation',
  );
  return emptyResponse(204);
}
