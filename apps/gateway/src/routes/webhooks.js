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

  if (APP_SECRET && signature && req.rawBody) {
    const expected = `sha256=${createHmac('sha256', APP_SECRET).update(req.rawBody).digest('hex')}`;
    const trusted = Buffer.from(expected, 'utf8');
    const received = Buffer.from(signature, 'utf8');
    if (trusted.length !== received.length || !timingSafeEqual(trusted, received)) {
      console.warn('[Webhook] Signature mismatch — check META_APP_SECRET. Continuing in dev mode.');
    }
  }

  const payload = req.body;

  if (payload.object === 'page' || payload.object === 'instagram') {
    try {
      // The recipient page ID tells us which org's Instagram account received this DM
      const recipientPageId = payload.entry?.[0]?.id;

      if (!recipientPageId || recipientPageId === '0') {
        console.warn('[Webhook] IG payload missing or placeholder entry[0].id — dropping.');
        return res.status(200).send('EVENT_RECEIVED');
      }

      // Check if this is a Meta test event (no real messaging data)
      const hasRealMessage = payload.entry?.[0]?.messaging?.[0]?.message ||
        payload.entry?.[0]?.changes?.[0]?.value?.message;
      if (!hasRealMessage) {
        console.log('[Webhook] IG test/echo event — skipping queue.');
        return res.status(200).send('EVENT_RECEIVED');
      }

      let organizationId = await resolveOrganizationId('ig_dm', recipientPageId);

      if (!organizationId) {
        console.warn(`[Webhook] No integration for id ${recipientPageId} — dropping.`);
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
// Each org's unique inbound address is {orgId}@{INBOUND_EMAIL_DOMAIN}.
// We extract the orgId from the local part of the To address — no fragile
// email-address DB lookup required.
// -----------------------------------------------------------------------------
router.post('/email/inbound', async (req, res) => {
  try {
    // Field names vary by provider — normalize them here
    // Postmark: From, To, Subject, TextBody
    // SendGrid: from, to, subject, text
    const rawFrom = req.body.From || req.body.from;
    const to = req.body.To || req.body.to;
    const subject = req.body.Subject || req.body.subject || 'No Subject';
    const text = req.body.TextBody || req.body.text;
    const inboundMessageId = req.body.MessageID || null;

    if (!rawFrom || !text) {
      return res.sendStatus(400);
    }

    if (!to) {
      console.warn('[Webhook] Inbound email missing To address — cannot route to org.');
      return res.sendStatus(400);
    }

    // Normalize addresses: strip display name, lowercase
    const toAddress = to.replace(/.*<(.+)>/, '$1').trim().toLowerCase();
    const fromAddress = rawFrom.replace(/.*<(.+)>/, '$1').trim();
    const fromName = rawFrom.replace(/<.*>/, '').trim().replace(/"/g, '') || null;

    // Routing — two strategies depending on the To address format:
    //
    // PRODUCTION: {orgId}@{INBOUND_EMAIL_DOMAIN}
    //   Extract the UUID from the local part and look up the org directly.
    //
    // DEVELOPMENT (ngrok + Postmark built-in address):
    //   The To address looks like abc123@inbound.postmarkapp.com — not a UUID.
    //   Fall back to a DB lookup by externalAccountId (the address stored when
    //   the user connected their email in the Integrations page).
    const localPart = toAddress.split('@')[0];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let organizationId;

    if (uuidRegex.test(localPart)) {
      // Production path: orgId is in the local part of the address
      const org = await db.organization.findUnique({
        where: { id: localPart },
        select: { id: true },
      });
      if (!org) {
        console.warn(`[Webhook] No organization found for id "${localPart}" — dropping.`);
        return res.status(200).send('OK');
      }
      organizationId = localPart;
    } else {
      // Dev fallback: look up by the full To address stored as externalAccountId
      const integration = await db.integration.findFirst({
        where: { platform: 'email', externalAccountId: { equals: toAddress, mode: 'insensitive' } },
        select: { organizationId: true },
      });
      if (!integration) {
        console.warn(`[Webhook] No email integration found for address "${toAddress}" — dropping.`);
        return res.status(200).send('OK');
      }
      organizationId = integration.organizationId;
    }

    await messageQueue.add('process-email', {
      platform: 'email',
      organizationId,
      senderEmail: fromAddress,
      senderName: fromName,
      subject,
      body: text,
      inboundMessageId,
    });

    console.log(`[Webhook] Inbound email from ${fromAddress} queued for org ${organizationId}`);
    return res.status(200).send('OK');
  } catch (error) {
    console.error('[Webhook] Failed to queue email:', error);
    return res.sendStatus(500);
  }
});

export default router;
