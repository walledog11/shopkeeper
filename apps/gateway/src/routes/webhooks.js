import express from 'express';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createHmac, timingSafeEqual } from 'crypto';
import { db } from '@clerk/db';

const router = express.Router();

const redisConnection = new IORedis(process.env.REDIS_URL);
const messageQueue = new Queue('inbound-messages', { connection: redisConnection });

// -----------------------------------------------------------------------------
// Helper: look up which organization owns a connected platform account
// Returns the organizationId string, or null if not found
// -----------------------------------------------------------------------------
async function resolveOrganizationId(platform, externalAccountId) {
  const integration = await db.integration.findFirst({
    where: { platform, externalAccountId },
    select: { organizationId: true },
  });
  return integration?.organizationId ?? null;
}

// -----------------------------------------------------------------------------
// GET: Meta Verification Handshake
// -----------------------------------------------------------------------------
router.get('/meta', (req, res) => {
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[Webhook] Meta handshake successful!');
      return res.status(200).send(challenge);
    } else {
      console.error('[Webhook] Meta handshake failed: Token mismatch.');
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
});

// -----------------------------------------------------------------------------
// POST: Catching Live Instagram DMs
// -----------------------------------------------------------------------------
router.post('/meta', async (req, res) => {
  const APP_SECRET = process.env.META_APP_SECRET;
  const signature = req.headers['x-hub-signature-256'];

  if (!APP_SECRET) {
    console.error('[Webhook] META_APP_SECRET is not set — cannot verify signature.');
    return res.sendStatus(500);
  }

  if (!signature || !req.rawBody) {
    console.error('[Webhook] Missing signature or raw body.');
    return res.sendStatus(401);
  }

  const expected = `sha256=${createHmac('sha256', APP_SECRET).update(req.rawBody).digest('hex')}`;
  const trusted = Buffer.from(expected, 'utf8');
  const received = Buffer.from(signature, 'utf8');

  if (trusted.length !== received.length || !timingSafeEqual(trusted, received)) {
    console.error('[Webhook] Signature verification failed.');
    return res.sendStatus(401);
  }

  const payload = req.body;

  if (payload.object === 'page' || payload.object === 'instagram') {
    try {
      // The recipient page ID tells us which org's Instagram account received this DM
      const recipientPageId = payload.entry?.[0]?.id;

      if (!recipientPageId) {
        console.warn('[Webhook] IG payload missing entry[0].id — dropping.');
        return res.status(200).send('EVENT_RECEIVED');
      }

      const organizationId = await resolveOrganizationId('ig_dm', recipientPageId);

      if (!organizationId) {
        console.warn(`[Webhook] No integration found for IG page ${recipientPageId} — dropping.`);
        // Still return 200 so Meta doesn't retry endlessly
        return res.status(200).send('EVENT_RECEIVED');
      }

      await messageQueue.add('process-ig-dm', {
        platform: 'ig_dm',
        organizationId,
        rawPayload: payload,
      });

      console.log(`[Webhook] IG DM queued for org ${organizationId}`);
      return res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
      console.error('[Webhook] Failed to add IG job to queue:', error);
      return res.sendStatus(500);
    }
  } else {
    return res.sendStatus(404);
  }
});

// -----------------------------------------------------------------------------
// POST: Catching Inbound Emails (Postmark / SendGrid / Mailgun)
// -----------------------------------------------------------------------------
router.post('/email/inbound', async (req, res) => {
  try {
    // Field names vary by provider — normalize them here
    // Postmark: From, To, Subject, TextBody
    // SendGrid: from, to, subject, text
    const from = req.body.From || req.body.from;
    const to = req.body.To || req.body.to;
    const subject = req.body.Subject || req.body.subject || 'No Subject';
    const text = req.body.TextBody || req.body.text;

    if (!from || !text) {
      return res.sendStatus(400);
    }

    if (!to) {
      console.warn('[Webhook] Inbound email missing To address — cannot route to org.');
      return res.sendStatus(400);
    }

    // Normalize the To address: strip display name, lowercase
    const toAddress = to.replace(/.*<(.+)>/, '$1').trim().toLowerCase();

    const organizationId = await resolveOrganizationId('email', toAddress);

    if (!organizationId) {
      console.warn(`[Webhook] No integration found for email address ${toAddress} — dropping.`);
      return res.status(200).send('OK');
    }

    await messageQueue.add('process-email', {
      platform: 'email',
      organizationId,
      senderEmail: from,
      subject,
      body: text,
    });

    console.log(`[Webhook] Inbound email from ${from} queued for org ${organizationId}`);
    return res.status(200).send('OK');
  } catch (error) {
    console.error('[Webhook] Failed to queue email:', error);
    return res.sendStatus(500);
  }
});

export default router;
