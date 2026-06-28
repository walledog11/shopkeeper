import { EventEmitter } from 'node:events';
import type { Application, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getDashboardUrl,
  getSubscriber,
  logger,
  subscriber,
  verifyToken,
} = vi.hoisted(() => {
  const subscriber = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };

  return {
    getDashboardUrl: vi.fn(() => 'https://dashboard.example.com/path'),
    getSubscriber: vi.fn(() => subscriber),
    logger: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
    subscriber,
    verifyToken: vi.fn(),
  };
});

vi.mock('../clients/redis-client.js', () => ({
  getGatewayRedisSubscriber: getSubscriber,
}));
vi.mock('../config/env.js', () => ({
  getGatewayDashboardUrl: getDashboardUrl,
}));
vi.mock('../logger.js', () => ({ default: logger }));
vi.mock('./token.js', () => ({
  verifyRealtimeToken: verifyToken,
}));

type RouteHandler = (req: Request, res: Response) => void;
type SubscriberMessageHandler = (channel: string, message: string) => void;

function createApp() {
  let eventsHandler: RouteHandler | undefined;
  const app = {
    get: vi.fn((path: string, handler: RouteHandler) => {
      if (path === '/events') eventsHandler = handler;
    }),
  } as unknown as Application;

  return {
    app,
    getEventsHandler: () => {
      if (!eventsHandler) throw new Error('Expected /events to be mounted');
      return eventsHandler;
    },
  };
}

function createRequest(token: unknown): Request & EventEmitter {
  const req = new EventEmitter() as Request & EventEmitter;
  Object.assign(req, { query: { token } });
  return req;
}

function createResponse() {
  const res = {
    json: vi.fn(),
    status: vi.fn(),
    write: vi.fn(),
    writeHead: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as Response & {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    writeHead: ReturnType<typeof vi.fn>;
  };
}

function getMessageHandler(): SubscriberMessageHandler {
  const call = subscriber.on.mock.calls.find(([event]) => event === 'message');
  if (!call) throw new Error('Expected Redis message listener');
  return call[1] as SubscriberMessageHandler;
}

describe('mountRealtime', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv('GATEWAY_REALTIME_ENABLED', 'true');
    getDashboardUrl.mockClear();
    getSubscriber.mockClear();
    logger.error.mockClear();
    logger.info.mockClear();
    logger.warn.mockClear();
    subscriber.on.mockClear();
    subscriber.subscribe.mockClear();
    verifyToken.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('does not mount or subscribe when realtime is disabled', async () => {
    vi.stubEnv('GATEWAY_REALTIME_ENABLED', 'false');
    const { mountRealtime } = await import('./sse.js');
    const { app } = createApp();

    mountRealtime(app);

    expect(app.get).not.toHaveBeenCalled();
    expect(getSubscriber).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      '[Realtime] Disabled (set GATEWAY_REALTIME_ENABLED=true to enable)',
    );
  });

  it('subscribes once, validates clients, dispatches events, and cleans up connections', async () => {
    const { mountRealtime } = await import('./sse.js');
    const firstApp = createApp();

    mountRealtime(firstApp.app);
    mountRealtime(createApp().app);

    expect(getSubscriber).toHaveBeenCalledTimes(1);
    expect(subscriber.subscribe).toHaveBeenCalledTimes(1);
    expect(getDashboardUrl).toHaveBeenCalledTimes(2);

    const subscribeCallback = subscriber.subscribe.mock.calls[0]?.[1] as
      | ((error?: Error) => void)
      | undefined;
    expect(subscribeCallback).toBeTypeOf('function');
    subscribeCallback?.();
    expect(logger.info).toHaveBeenCalledWith(
      { channel: 'realtime:thread' },
      '[Realtime] Subscribed',
    );

    const handler = firstApp.getEventsHandler();
    verifyToken.mockReturnValueOnce(null);
    const unauthorizedResponse = createResponse();
    handler(createRequest(['not', 'a', 'string']), unauthorizedResponse);
    expect(verifyToken).toHaveBeenCalledWith(undefined);
    expect(unauthorizedResponse.status).toHaveBeenCalledWith(401);
    expect(unauthorizedResponse.json).toHaveBeenCalledWith({
      error: 'Invalid or expired token',
    });

    verifyToken.mockReturnValue('org-1');
    const firstRequest = createRequest('valid-token');
    const firstResponse = createResponse();
    handler(firstRequest, firstResponse);

    expect(verifyToken).toHaveBeenLastCalledWith('valid-token');
    expect(firstResponse.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': 'https://dashboard.example.com',
      Vary: 'Origin',
    });
    expect(firstResponse.write).toHaveBeenCalledWith(': connected\n\n');

    const secondRequest = createRequest('second-token');
    const secondResponse = createResponse();
    handler(secondRequest, secondResponse);

    const onMessage = getMessageHandler();
    onMessage('other-channel', JSON.stringify({ orgId: 'org-1', threadId: 'ignored' }));
    onMessage('realtime:thread', 'not-json');
    onMessage('realtime:thread', JSON.stringify({ orgId: 'org-1' }));
    onMessage('realtime:thread', JSON.stringify({ orgId: 'org-2', threadId: 'other-org' }));
    onMessage('realtime:thread', JSON.stringify({ orgId: 'org-1', threadId: 'thread-1' }));

    const expectedFrame = 'event: thread\ndata: {"threadId":"thread-1"}\n\n';
    expect(firstResponse.write).toHaveBeenCalledWith(expectedFrame);
    expect(secondResponse.write).toHaveBeenCalledWith(expectedFrame);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(String) }),
      '[Realtime] Bad event payload',
    );

    firstResponse.write.mockImplementationOnce(() => {
      throw new Error('connection closed');
    });
    onMessage('realtime:thread', JSON.stringify({ orgId: 'org-1', threadId: 'thread-2' }));
    expect(logger.warn).toHaveBeenCalledWith(
      { err: 'connection closed' },
      '[Realtime] write to client failed',
    );

    vi.advanceTimersByTime(25_000);
    expect(firstResponse.write).toHaveBeenCalledWith(': ping\n\n');
    expect(secondResponse.write).toHaveBeenCalledWith(': ping\n\n');

    firstRequest.emit('close');
    secondRequest.emit('close');
    const firstWrites = firstResponse.write.mock.calls.length;
    const secondWrites = secondResponse.write.mock.calls.length;
    onMessage('realtime:thread', JSON.stringify({ orgId: 'org-1', threadId: 'thread-3' }));
    expect(firstResponse.write).toHaveBeenCalledTimes(firstWrites);
    expect(secondResponse.write).toHaveBeenCalledTimes(secondWrites);
  });

  it('allows a retry after a Redis subscription failure', async () => {
    const { mountRealtime } = await import('./sse.js');

    mountRealtime(createApp().app);
    const subscribeCallback = subscriber.subscribe.mock.calls[0]?.[1] as
      | ((error?: Error) => void)
      | undefined;
    subscribeCallback?.(new Error('Redis unavailable'));

    expect(logger.error).toHaveBeenCalledWith(
      { err: 'Redis unavailable' },
      '[Realtime] Failed to subscribe to channel',
    );

    mountRealtime(createApp().app);
    expect(subscriber.subscribe).toHaveBeenCalledTimes(2);
  });
});
