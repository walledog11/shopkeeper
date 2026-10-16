import { after } from 'next/server';
import { processWaitlistSync, recordLoopsWaitlistEvent, verifyLoopsWebhook } from '@shopkeeper/email/waitlist';
import logger from '@/lib/server/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.LOOPS_SIGNING_SECRET;
  if (!secret) return Response.json({ error: 'Webhook not configured' }, { status: 503 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: 'Missing body' }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65_536) {
        await reader.cancel();
        return Response.json({ error: 'Payload too large' }, { status: 413 });
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = Buffer.concat(chunks).toString('utf8');
  let id: string;
  let event: unknown;
  try {
    id = verifyLoopsWebhook(request.headers, body, secret);
  } catch { return Response.json({ error: 'Invalid signature' }, { status: 401 }); }
  try { event = JSON.parse(body); }
  catch { return Response.json({ error: 'Invalid payload' }, { status: 400 }); }
  try {
    const result = await recordLoopsWaitlistEvent(id, event);
    after(async () => {
      try { await processWaitlistSync({ limit: 1 }); }
      catch { logger.error({ event: 'waitlist_webhook_sync_failed' }, 'Waitlist sync will retry in the worker'); }
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_webhook_payload') return Response.json({ error: 'Invalid payload' }, { status: 400 });
    logger.error({ event: 'waitlist_webhook_save_failed' }, 'Could not record Loops event');
    return Response.json({ error: 'Please retry' }, { status: 503 });
  }
}
