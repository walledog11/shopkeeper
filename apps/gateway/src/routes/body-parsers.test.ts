import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../logger.js', () => ({ default: mockLogger }));

import { bodyLimitErrorHandler } from './body-parsers.js';

type HandlerArgs = Parameters<typeof bodyLimitErrorHandler>;

function invoke(err: HandlerArgs[0]) {
  const req = { path: '/telegram', headers: { 'content-type': 'application/json' } } as HandlerArgs[1];
  const json = vi.fn();
  const res = { status: vi.fn().mockReturnValue({ json }) } as unknown as HandlerArgs[2];
  const next = vi.fn() as HandlerArgs[3];

  bodyLimitErrorHandler(err, req, res, next);
  return { json, next, res };
}

describe('bodyLimitErrorHandler', () => {
  beforeEach(() => {
    mockLogger.warn.mockClear();
  });

  it('answers an oversized body with JSON rather than the default HTML page', () => {
    const { json, next, res } = invoke(
      Object.assign(new Error('request entity too large'), {
        type: 'entity.too.large',
        length: 3_000_000,
        limit: 2_097_152,
      }),
    );

    expect(res.status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({ error: 'Payload too large' });
    expect(next).not.toHaveBeenCalled();
  });

  it('records the rejected size, limit and content type', () => {
    invoke(
      Object.assign(new Error('request entity too large'), {
        type: 'entity.too.large',
        length: 3_000_000,
        limit: 2_097_152,
      }),
    );

    expect(mockLogger.warn).toHaveBeenCalledWith(
      {
        path: '/telegram',
        contentType: 'application/json',
        contentLength: 3_000_000,
        limit: 2_097_152,
      },
      '[Gateway] Rejected oversized request body',
    );
  });

  it('passes any other error through untouched', () => {
    const err = Object.assign(new Error('bad json'), { type: 'entity.parse.failed' });
    const { json, next } = invoke(err);

    expect(next).toHaveBeenCalledWith(err);
    expect(json).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});
