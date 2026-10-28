import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerWarn, mockRateLimit } = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  mockRateLimit: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  default: { warn: loggerWarn },
}));

vi.mock('@/lib/server/rate-limit', () => ({
  rateLimit: mockRateLimit,
}));

import { parseCspViolations, POST } from './route';

function request(body: string, contentType = 'application/csp-report', headers = {}) {
  return new Request('https://dashboard.test/api/security/csp-report', {
    method: 'POST',
    body,
    headers: {
      'content-type': contentType,
      'x-forwarded-for': '203.0.113.10',
      ...headers,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue({ success: true, remaining: 29, reset: 1 });
});

describe('CSP report collection', () => {
  it('sanitizes legacy reports without retaining paths, queries, or samples', () => {
    expect(parseCspViolations({
      'csp-report': {
        'document-uri': 'https://dashboard.test/orders/private?id=customer',
        'effective-directive': 'script-src-elem',
        'violated-directive': 'script-src-elem',
        'blocked-uri': 'https://evil.test/payload.js?secret=1',
        'source-file': 'https://dashboard.test/private/chunk.js?token=secret',
        'status-code': 200,
        sample: 'sensitive inline script',
      },
    })).toEqual([{
      blockedResource: 'https://evil.test',
      disposition: null,
      documentOrigin: 'https://dashboard.test',
      effectiveDirective: 'script-src-elem',
      sourceOrigin: 'https://dashboard.test',
      statusCode: 200,
      violatedDirective: 'script-src-elem',
    }]);
  });

  it('accepts Reporting API batches and limits them to five reports', () => {
    const report = {
      type: 'csp-violation',
      body: {
        documentURL: 'https://dashboard.test/',
        effectiveDirective: 'connect-src',
        blockedURL: 'data:text/plain,private',
        disposition: 'report',
      },
    };
    expect(parseCspViolations(Array.from({ length: 8 }, () => report))).toHaveLength(5);
    expect(parseCspViolations([report])[0]).toMatchObject({
      blockedResource: 'data:',
      disposition: 'report',
      effectiveDirective: 'connect-src',
    });
  });

  it('logs only sanitized violations and returns no content', async () => {
    const response = await POST(request(JSON.stringify({
      'csp-report': {
        'document-uri': 'https://dashboard.test/orders/private',
        'effective-directive': 'script-src',
        'blocked-uri': 'eval',
      },
    })));

    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.stringMatching(/^csp-report:[0-9a-f]{16}$/),
      30,
      60,
    );
    expect(loggerWarn).toHaveBeenCalledWith({
      reportCount: 1,
      violations: [expect.objectContaining({
        blockedResource: 'eval',
        documentOrigin: 'https://dashboard.test',
      })],
    }, '[CSP] Browser policy violation');
    expect(JSON.stringify(loggerWarn.mock.calls)).not.toContain('/orders/private');
  });

  it.each([
    ['unsupported media type', request('{}', 'text/plain'), 415],
    ['malformed JSON', request('{'), 400],
    ['unrecognized report', request('{}'), 400],
  ])('rejects %s', async (_name, input, expectedStatus) => {
    expect((await POST(input)).status).toBe(expectedStatus);
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it('rejects declared and measured oversized bodies', async () => {
    const declared = request('{}', 'application/csp-report', { 'content-length': '20000' });
    expect((await POST(declared)).status).toBe(413);

    const measured = request(JSON.stringify({
      'csp-report': {
        'effective-directive': 'script-src',
        padding: 'x'.repeat(17_000),
      },
    }));
    expect((await POST(measured)).status).toBe(413);
  });

  it('silently drops reports after the privacy-safe per-client limit', async () => {
    mockRateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 1 });
    const response = await POST(request('{}'));
    expect(response.status).toBe(204);
    expect(loggerWarn).not.toHaveBeenCalled();
  });
});
