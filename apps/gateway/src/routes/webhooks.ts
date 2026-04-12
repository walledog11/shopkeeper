import express, { Request, Response } from 'express';
import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import { db, ChannelType } from '@clerk/db';
import twilio from 'twilio';
import { getContext, updateContext, extractOrderNumber, type ToolCall } from '../sms-context.js';
import logger from '../logger.js';
import { CHANNEL, QUEUE, JOB, READ_TOOLS } from '../constants.js';

const router = express.Router();

const FILLER_PHRASES = [
  'On it…',
  'Give me a sec…',
  'Making it happen…',
  'Looking into that…',
  'Just a moment…',
];
const filler = () => FILLER_PHRASES[Math.floor(Math.random() * FILLER_PHRASES.length)];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const redisConnection = new IORedis(process.env.REDIS_URL!, { db: 0 }) as any;
const messageQueue = new Queue(QUEUE.INBOUND, { connection: redisConnection });

async function resolveOrganizationId(platform: ChannelType, externalAccountId: string): Promise<string | null> {
  const integration = await db.integration.findFirst({
    where: { platform, externalAccountId },
    select: { organizationId: true },
  });
  return integration?.organizationId ?? null;
}

// -----------------------------------------------------------------------------
// GET: Meta Verification Handshake
// -----------------------------------------------------------------------------
router.get('/meta', (req: Request, res: Response) => {
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      logger.info('[Webhook] Meta handshake successful');
      return res.status(200).send(challenge);
    } else {
      logger.warn('[Webhook] Meta handshake failed: token mismatch');
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
});

// -----------------------------------------------------------------------------
// POST: Catching Live Instagram DMs
// -----------------------------------------------------------------------------
router.post('/meta', async (req: Request, res: Response) => {
  const APP_SECRET = process.env.META_APP_SECRET;
  const signature = req.headers['x-hub-signature-256'] as string | undefined;

  if (!APP_SECRET) {
    logger.error('[Webhook] META_APP_SECRET is not configured — rejecting.');
    return res.sendStatus(500);
  }
  if (!signature || !req.rawBody) {
    logger.warn('[Webhook] Missing signature or raw body — rejecting.');
    return res.sendStatus(401);
  }
  const expected = `sha256=${createHmac('sha256', APP_SECRET).update(req.rawBody).digest('hex')}`;
  const trusted = Buffer.from(expected, 'utf8');
  const received = Buffer.from(signature, 'utf8');
  if (trusted.length !== received.length || !timingSafeEqual(trusted, received)) {
    logger.warn('[Webhook] Signature mismatch — rejecting request.');
    return res.sendStatus(401);
  }

  const payload = req.body as {
    object?: string;
    entry?: Array<{
      id?: string;
      messaging?: Array<{ message?: unknown }>;
      changes?: Array<{ value?: { message?: unknown } }>;
    }>;
  };

  if (payload.object === 'page' || payload.object === 'instagram') {
    try {
      const recipientPageId = payload.entry?.[0]?.id;

      if (!recipientPageId || recipientPageId === '0') {
        logger.warn('[Webhook] IG payload missing or placeholder entry[0].id — dropping.');
        return res.status(200).send('EVENT_RECEIVED');
      }

      const hasRealMessage =
        payload.entry?.[0]?.messaging?.[0]?.message ||
        payload.entry?.[0]?.changes?.[0]?.value?.message;
      if (!hasRealMessage) {
        logger.info('[Webhook] IG test/echo event — skipping queue.');
        return res.status(200).send('EVENT_RECEIVED');
      }

      const organizationId = await resolveOrganizationId(CHANNEL.IG_DM, recipientPageId);

      if (!organizationId) {
        logger.warn({ recipientPageId }, '[Webhook] No integration for IG page id — dropping.');
        return res.status(200).send('EVENT_RECEIVED');
      }

      const traceId = randomUUID();
      await messageQueue.add(JOB.IG_DM, {
        platform: CHANNEL.IG_DM,
        organizationId,
        rawPayload: payload,
        traceId,
      });

      logger.info({ organizationId, traceId }, '[Webhook] IG DM queued');
      return res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
      logger.error({ err: error }, '[Webhook] Failed to add IG job to queue');
      return res.sendStatus(500);
    }
  }

  return res.sendStatus(404);
});

// -----------------------------------------------------------------------------
// POST: Catching Inbound Emails (Postmark / SendGrid / Mailgun)
// -----------------------------------------------------------------------------
router.post('/email/inbound', async (req: Request, res: Response) => {
  try {
    const rawFrom: string | undefined = req.body.From || req.body.from;
    const to: string | undefined = req.body.To || req.body.to;
    const subject: string = req.body.Subject || req.body.subject || 'No Subject';
    const text: string | undefined = req.body.TextBody || req.body.text;
    const emailHeaders: Array<{ Name: string; Value: string }> = req.body.Headers || [];
    const msgIdHeader = emailHeaders.find(h => h.Name === 'Message-ID');
    const inboundMessageId: string | null = msgIdHeader?.Value || null;

    if (!rawFrom || !text) {
      return res.sendStatus(400);
    }

    if (!to) {
      logger.warn('[Webhook] Inbound email missing To address — cannot route to org.');
      return res.sendStatus(400);
    }

    const toAddress = to.replace(/.*<(.+)>/, '$1').trim().toLowerCase();
    const fromAddress = rawFrom.replace(/.*<(.+)>/, '$1').trim();
    const fromName = rawFrom.replace(/<.*>/, '').trim().replace(/"/g, '') || null;

    const localPart = toAddress.split('@')[0];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let organizationId: string;

    if (uuidRegex.test(localPart)) {
      const org = await db.organization.findUnique({
        where: { id: localPart },
        select: { id: true },
      });
      if (!org) {
        logger.warn({ localPart }, '[Webhook] No organization found for id — dropping.');
        return res.status(200).send('OK');
      }
      organizationId = localPart;
    } else {
      const integration = await db.integration.findFirst({
        where: { platform: CHANNEL.EMAIL, externalAccountId: { equals: toAddress, mode: 'insensitive' } },
        select: { organizationId: true },
      });
      if (!integration) {
        logger.warn({ toAddress }, '[Webhook] No email integration found for address — dropping.');
        return res.status(200).send('OK');
      }
      organizationId = integration.organizationId;
    }

    const traceId = randomUUID();
    await messageQueue.add(JOB.EMAIL, {
      platform: CHANNEL.EMAIL,
      organizationId,
      senderEmail: fromAddress,
      senderName: fromName,
      subject,
      body: text,
      inboundMessageId,
      traceId,
    });

    logger.info({ fromAddress, organizationId, traceId }, '[Webhook] Inbound email queued');
    return res.status(200).send('OK');
  } catch (error) {
    logger.error({ err: error }, '[Webhook] Failed to queue email');
    return res.sendStatus(500);
  }
});

// -----------------------------------------------------------------------------
// POST: Inbound SMS / WhatsApp via Twilio
// -----------------------------------------------------------------------------
router.post('/twilio', async (req: Request, res: Response) => {
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

  const incomingSecret = req.headers['x-internal-secret'] as string | undefined;
  const validInternalSecrets = (
    [process.env.INTERNAL_API_SECRET, process.env.INTERNAL_API_SECRET_PREV] as (string | undefined)[]
  ).filter((s): s is string => typeof s === 'string' && s.length > 0);
  const isInternalProxy = !!incomingSecret && validInternalSecrets.some((candidate) => {
    try { return timingSafeEqual(Buffer.from(candidate, 'utf8'), Buffer.from(incomingSecret, 'utf8')); }
    catch { return false; }
  });

  if (!isInternalProxy) {
    if (!twilioAuthToken) {
      logger.error('[Twilio] TWILIO_AUTH_TOKEN is not configured — rejecting.');
      return res.status(500).send('Internal Server Error');
    }
    const twilioSignature = req.headers['x-twilio-signature'] as string | undefined;
    const webhookUrl = process.env.TWILIO_WEBHOOK_URL;
    if (!twilioSignature) {
      logger.warn('[Twilio] Missing signature — rejecting.');
      return res.status(403).send('Forbidden');
    }
    if (!webhookUrl) {
      logger.error('[Twilio] TWILIO_WEBHOOK_URL is not configured — rejecting.');
      return res.status(500).send('Internal Server Error');
    }
    const isValid = twilio.validateRequest(twilioAuthToken, twilioSignature, webhookUrl, req.body as Record<string, string>);
    if (!isValid) {
      logger.warn('[Twilio] Signature validation failed — rejecting request.');
      return res.status(403).send('Forbidden');
    }
  }

  const toRaw: string = req.body.To || '';
  const fromRaw: string = req.body.From || '';
  const body: string = (req.body.Body || '').trim();

  const toNumber = toRaw.replace(/^whatsapp:/, '');
  const fromNumber = fromRaw.replace(/^whatsapp:/, '');

  if (!toNumber || !fromNumber || !body) {
    return res.status(400).send('Bad Request');
  }

  const twimlReply = (text: string) => {
    res.type('text/xml');
    return res.send(`<Response><Message>${text}</Message></Response>`);
  };

  const proactiveSend = async (text: string) => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) return;
    try {
      await twilio(sid, token).messages.create({ from: toRaw, to: fromRaw, body: text });
    } catch (e) {
      logger.warn({ err: (e as Error).message }, '[Twilio] Failed to send proactive message');
    }
  };

  try {
    let organizationId: string;

    const integration = await db.integration.findFirst({
      where: { platform: CHANNEL.SMS, externalAccountId: toNumber },
      select: { organizationId: true },
    });

    if (integration) {
      organizationId = integration.organizationId;
    } else {
      const memberByPhone = await db.orgMember.findFirst({
        where: { phoneNumber: fromNumber, phoneVerified: true },
        select: { organizationId: true },
      });
      if (!memberByPhone) {
        logger.warn({ toNumber, fromNumber }, '[Twilio] No integration found and no verified member — dropping.');
        return res.status(200).send('OK');
      }
      organizationId = memberByPhone.organizationId;
      logger.info({ organizationId, fromNumber }, '[Twilio] Sandbox fallback — resolved org via sender phone');
    }

    const member = await db.orgMember.findFirst({
      where: { organizationId, phoneNumber: fromNumber, phoneVerified: true },
    });

    if (!member) {
      logger.warn({ fromNumber, organizationId }, '[Twilio] Unregistered sender');
      return twimlReply("Your number isn't registered. Add it in your Clerk dashboard under Settings > Phone.");
    }

    const ctx = await getContext(organizationId, fromNumber);

    const dashboardUrl = process.env.DASHBOARD_INTERNAL_URL || 'http://localhost:3000';
    const internalSecret = process.env.INTERNAL_API_SECRET;

    const normalised = body.toLowerCase().trim();
    const isRun = normalised === 'run' || normalised === 'yes';
    const isDismiss = normalised === 'dismiss' || normalised === 'no';
    const skipMatch = normalised.match(/^skip\s+(\d+)$/);

    if ((isRun || isDismiss || skipMatch) && ctx.pendingPlan) {
      const { threadId, instruction, rawToolCalls } = ctx.pendingPlan;

      if (isDismiss) {
        await updateContext(organizationId, fromNumber, { pendingPlan: null });
        return twimlReply('Plan dismissed.');
      }

      let approvedToolCalls: ToolCall[] = rawToolCalls;
      if (skipMatch) {
        const skipIndex = parseInt(skipMatch[1], 10) - 1;
        const actionableCalls = rawToolCalls.filter(tc => !READ_TOOLS.has(tc.name));
        const toSkip = actionableCalls[skipIndex];
        approvedToolCalls = toSkip
          ? rawToolCalls.filter(tc => tc.id !== toSkip.id)
          : rawToolCalls;
      }

      logger.info({ fromNumber, threadId, toolCallCount: approvedToolCalls.length }, '[Twilio] Approving plan');

      await proactiveSend(filler());
      res.type('text/xml').send('<Response/>');

      const agentRes = await fetch(`${dashboardUrl}/api/agent/internal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': internalSecret || '',
        },
        body: JSON.stringify({
          orgId: organizationId,
          threadId,
          instruction,
          approvedToolCalls,
          senderPhone: fromNumber,
          clerkUserId: member.clerkUserId,
        }),
      });

      if (!agentRes.ok) {
        const err = await agentRes.text();
        logger.error({ status: agentRes.status, err }, '[Twilio] Internal agent API error');
        await proactiveSend('Something went wrong running the plan. Please try again.');
        return;
      }

      const { summary } = await agentRes.json() as { summary: string };

      await updateContext(organizationId, fromNumber, {
        pendingPlan: null,
        lastThreadId: threadId,
        history: [
          ...ctx.history,
          { role: 'user', content: body },
          { role: 'assistant', content: summary },
        ],
      });

      await proactiveSend(summary || 'Done.');
      return;
    }

    // Free-form agent instruction path
    const mentionedOrder = extractOrderNumber(body);
    const orderNumber = mentionedOrder || ctx.lastOrderNumber;

    logger.info({ fromNumber, organizationId, orderNumber: orderNumber || null }, '[Twilio] Free-form agent instruction');

    await proactiveSend(filler());
    res.type('text/xml').send('<Response/>');

    const agentRes = await fetch(`${dashboardUrl}/api/agent/internal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret || '',
      },
      body: JSON.stringify({
        orgId: organizationId,
        instruction: body,
        ...(orderNumber ? { orderNumber } : {}),
        ...(ctx.lastThreadId ? { threadId: ctx.lastThreadId } : {}),
        senderPhone: fromNumber,
        clerkUserId: member.clerkUserId,
      }),
    });

    if (!agentRes.ok) {
      const err = await agentRes.text();
      logger.error({ status: agentRes.status, err }, '[Twilio] Internal agent API error (free-form)');
      await proactiveSend('Something went wrong running the agent. Please try again.');
      return;
    }

    const { summary, threadId } = await agentRes.json() as { summary: string; threadId: string };

    await updateContext(organizationId, fromNumber, {
      ...(orderNumber ? { lastOrderNumber: orderNumber } : {}),
      lastThreadId: threadId,
      history: [
        ...ctx.history,
        { role: 'user', content: body },
        { role: 'assistant', content: summary },
      ],
    });

    await proactiveSend(summary || 'Done.');

  } catch (error) {
    logger.error({ err: error }, '[Twilio] Webhook error');
    if (!res.headersSent) {
      return twimlReply('An unexpected error occurred. Please try again.');
    }
    await proactiveSend('An unexpected error occurred. Please try again.');
  }
});

// -----------------------------------------------------------------------------
// POST: Inbound Shopify Order Events
// -----------------------------------------------------------------------------
const SHOPIFY_SUPPORTED_TOPICS = new Set(['orders/created', 'orders/fulfilled', 'orders/updated', 'orders/cancelled']);

router.post('/shopify', async (req: Request, res: Response) => {
  const APP_SECRET = process.env.SHOPIFY_APP_SECRET;
  const signature = req.headers['x-shopify-hmac-sha256'] as string | undefined;

  if (!APP_SECRET) {
    logger.error('[Webhook] SHOPIFY_APP_SECRET is not configured — rejecting.');
    return res.sendStatus(500);
  }
  if (!signature || !req.rawBody) {
    logger.warn('[Webhook] Shopify missing signature or raw body — rejecting.');
    return res.sendStatus(401);
  }
  const expected = createHmac('sha256', APP_SECRET).update(req.rawBody).digest('base64');
  const trusted = Buffer.from(expected, 'utf8');
  const received = Buffer.from(signature, 'utf8');
  if (trusted.length !== received.length || !timingSafeEqual(trusted, received)) {
    logger.warn('[Webhook] Shopify signature mismatch — rejecting.');
    return res.sendStatus(401);
  }

  const topic = req.headers['x-shopify-topic'] as string | undefined;
  const shopDomain = req.headers['x-shopify-shop-domain'] as string | undefined;

  if (!topic || !SHOPIFY_SUPPORTED_TOPICS.has(topic)) {
    return res.status(200).send('OK');
  }

  if (!shopDomain) {
    logger.warn('[Webhook] Shopify missing shop domain header — dropping.');
    return res.sendStatus(400);
  }

  try {
    const organizationId = await resolveOrganizationId(CHANNEL.SHOPIFY, shopDomain);
    if (!organizationId) {
      logger.warn({ shopDomain }, '[Webhook] No Shopify integration found — dropping.');
      return res.status(200).send('OK');
    }

    const traceId = randomUUID();
    await messageQueue.add(JOB.SHOPIFY, {
      platform: CHANNEL.SHOPIFY,
      organizationId,
      topic,
      rawPayload: req.body,
      traceId,
    });

    logger.info({ organizationId, topic, traceId }, '[Webhook] Shopify order event queued');
    return res.status(200).send('OK');
  } catch (error) {
    logger.error({ err: error }, '[Webhook] Failed to queue Shopify event');
    return res.sendStatus(500);
  }
});

export default router;
