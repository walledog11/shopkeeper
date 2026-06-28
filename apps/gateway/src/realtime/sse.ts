import type { Application, Request, Response } from 'express';
import { getGatewayRedisSubscriber } from '../clients/redis-client.js';
import { getGatewayDashboardUrl } from '../config/env.js';
import logger from '../logger.js';
import { REALTIME_CHANNEL, type ThreadEvent } from './publish.js';
import { verifyRealtimeToken } from './token.js';

const HEARTBEAT_MS = 25_000;

// orgId -> set of open SSE responses held by THIS server instance. With multiple
// instances every instance subscribes to the global channel and pushes to its own
// local connections, so fan-out is correct without sticky sessions.
const connections = new Map<string, Set<Response>>();

let subscribed = false;

function register(orgId: string, res: Response): void {
  let set = connections.get(orgId);
  if (!set) {
    set = new Set();
    connections.set(orgId, set);
  }
  set.add(res);
}

function unregister(orgId: string, res: Response): void {
  const set = connections.get(orgId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) connections.delete(orgId);
}

function dispatch(event: ThreadEvent): void {
  const set = connections.get(event.orgId);
  if (!set || set.size === 0) return;

  const frame = `event: thread\ndata: ${JSON.stringify({ threadId: event.threadId })}\n\n`;
  for (const res of set) {
    try {
      res.write(frame);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, '[Realtime] write to client failed');
    }
  }
}

function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;

  const subscriber = getGatewayRedisSubscriber();
  subscriber.subscribe(REALTIME_CHANNEL, (err) => {
    if (err) {
      subscribed = false;
      logger.error({ err: err.message }, '[Realtime] Failed to subscribe to channel');
    } else {
      logger.info({ channel: REALTIME_CHANNEL }, '[Realtime] Subscribed');
    }
  });

  subscriber.on('message', (channel, message) => {
    if (channel !== REALTIME_CHANNEL) return;
    try {
      const event = JSON.parse(message) as ThreadEvent;
      if (event?.orgId && event?.threadId) dispatch(event);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, '[Realtime] Bad event payload');
    }
  });
}

export function mountRealtime(app: Application): void {
  if (process.env.GATEWAY_REALTIME_ENABLED !== 'true') {
    logger.info('[Realtime] Disabled (set GATEWAY_REALTIME_ENABLED=true to enable)');
    return;
  }

  const allowedOrigin = new URL(getGatewayDashboardUrl()).origin;
  ensureSubscribed();

  app.get('/events', (req: Request, res: Response) => {
    const orgId = verifyRealtimeToken(typeof req.query.token === 'string' ? req.query.token : undefined);
    if (!orgId) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': allowedOrigin,
      Vary: 'Origin',
    });
    res.write(': connected\n\n');

    register(orgId, res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        // Connection is gone; the close handler will clean up.
      }
    }, HEARTBEAT_MS);

    req.on('close', () => {
      clearInterval(heartbeat);
      unregister(orgId, res);
    });
  });

  logger.info('[Realtime] SSE endpoint mounted at /events');
}
