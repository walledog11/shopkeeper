import express from 'express';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createHmac, timingSafeEqual } from 'crypto';
import { db } from '@clerk/db';
import twilio from 'twilio';
import { getContext, updateContext, extractOrderNumber } from '../sms-context.js';

const router = express.Router();

const redisConnection = new IORedis(process.env.REDIS_URL);
const messageQueue = new Queue('inbound-messages', { connection: redisConnection });

// Shared Redis client for SMS context (read/write only, no BullMQ requirements)
const contextRedis = new IORedis(process.env.REDIS_URL);

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

  if (APP_SECRET) {
    if (!signature || !req.rawBody) {
      console.warn('[Webhook] Missing signature or raw body — rejecting.');
      return res.sendStatus(401);
    }
    const expected = `sha256=${createHmac('sha256', APP_SECRET).update(req.rawBody).digest('hex')}`;
    const trusted = Buffer.from(expected, 'utf8');
    const received = Buffer.from(signature, 'utf8');
    if (trusted.length !== received.length || !timingSafeEqual(trusted, received)) {
      console.error('[Webhook] Signature mismatch — rejecting request.');
      return res.sendStatus(401);
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

// -----------------------------------------------------------------------------
// POST: Inbound SMS / WhatsApp via Twilio
//
// Twilio sends both SMS and WhatsApp to the same webhook endpoint.
// WhatsApp numbers are prefixed with "whatsapp:" in To/From fields.
//
// Auth flow:
//   1. Verify Twilio request signature (prevents spoofing).
//   2. Identify the org from the "To" number (stored as the integration's
//      externalAccountId for the "sms" platform).
//   3. Identify the team member from the "From" number via OrgMember table.
//   4. Load/save conversation context from Redis.
//   5. POST to the dashboard's internal agent endpoint.
//   6. Reply to the sender via Twilio TwiML.
// -----------------------------------------------------------------------------
router.post('/twilio', async (req, res) => {
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

  // Skip signature validation for requests forwarded from the dashboard proxy
  const isInternalProxy = req.headers['x-internal-secret'] === process.env.INTERNAL_API_SECRET;

  if (twilioAuthToken && !isInternalProxy) {
    const twilioSignature = req.headers['x-twilio-signature'];
    const webhookUrl = process.env.TWILIO_WEBHOOK_URL;
    if (twilioSignature && webhookUrl) {
      const isValid = twilio.validateRequest(twilioAuthToken, twilioSignature, webhookUrl, req.body);
      if (!isValid) {
        console.warn('[Twilio] Signature validation failed — rejecting request.');
        return res.status(403).send('Forbidden');
      }
    }
  }

  const toRaw = req.body.To || '';
  const fromRaw = req.body.From || '';
  const body = (req.body.Body || '').trim();

  // Normalise: strip whatsapp: prefix for DB lookups
  const toNumber = toRaw.replace(/^whatsapp:/, '');
  const fromNumber = fromRaw.replace(/^whatsapp:/, '');

  if (!toNumber || !fromNumber || !body) {
    return res.status(400).send('Bad Request');
  }

  // Helper: reply via TwiML (works for both SMS and WhatsApp)
  const twimlReply = (text) => {
    res.type('text/xml');
    return res.send(`<Response><Message>${text}</Message></Response>`);
  };

  try {
    // 1. Identify the org from the Twilio number this was sent TO.
    //    For WhatsApp sandbox the To number is Twilio's shared sandbox number, not the
    //    org's own number — so if the direct lookup misses, fall back to identifying
    //    the org via the sender's verified OrgMember record.
    let organizationId;

    const integration = await db.integration.findFirst({
      where: { platform: 'sms', externalAccountId: toNumber },
      select: { organizationId: true },
    });

    if (integration) {
      organizationId = integration.organizationId;
    } else {
      // Sandbox / WhatsApp fallback: find org by the sender's verified phone number
      const memberByPhone = await db.orgMember.findFirst({
        where: { phoneNumber: fromNumber, phoneVerified: true },
        select: { organizationId: true },
      });
      if (!memberByPhone) {
        console.warn(`[Twilio] No integration for ${toNumber} and no verified member for ${fromNumber} — dropping.`);
        return res.status(200).send('OK');
      }
      organizationId = memberByPhone.organizationId;
      console.log(`[Twilio] Sandbox fallback — resolved org ${organizationId} via sender phone ${fromNumber}`);
    }

    // 2. Identify the team member from the FROM number
    const member = await db.orgMember.findFirst({
      where: { organizationId, phoneNumber: fromNumber, phoneVerified: true },
    });

    if (!member) {
      console.warn(`[Twilio] Unregistered sender ${fromNumber} for org ${organizationId}`);
      return twimlReply("Your number isn't registered. Add it in your Clerk dashboard under Settings > Phone.");
    }

    // 3. Load conversation context
    const ctx = await getContext(contextRedis, fromNumber);

    const dashboardUrl = process.env.DASHBOARD_INTERNAL_URL || 'http://localhost:3000';
    const internalSecret = process.env.INTERNAL_API_SECRET;

    // 4. Check for plan approval commands: "run", "dismiss", "skip N"
    const normalised = body.toLowerCase().trim();
    const isRun = normalised === 'run';
    const isDismiss = normalised === 'dismiss';
    const skipMatch = normalised.match(/^skip\s+(\d+)$/);

    if ((isRun || isDismiss || skipMatch) && ctx.pendingPlan) {
      const { threadId, instruction, rawToolCalls } = ctx.pendingPlan;

      if (isDismiss) {
        await updateContext(contextRedis, fromNumber, { pendingPlan: null });
        return twimlReply("Plan dismissed.");
      }

      // Build the approved tool calls, optionally removing a skipped step.
      // Read-only tools (get_*) are never shown as numbered steps, so skip N
      // is 1-based over the actionable (non-read) calls only.
      const READ_TOOLS = ['get_shopify_customer', 'get_shopify_orders', 'get_order_by_name'];
      let approvedToolCalls = rawToolCalls;
      if (skipMatch) {
        const skipIndex = parseInt(skipMatch[1], 10) - 1;
        const actionableCalls = rawToolCalls.filter(tc => !READ_TOOLS.includes(tc.name));
        const toSkip = actionableCalls[skipIndex];
        approvedToolCalls = toSkip
          ? rawToolCalls.filter(tc => tc.id !== toSkip.id)
          : rawToolCalls;
      }

      console.log(`[Twilio] ${fromNumber} approving plan for thread ${threadId} (${approvedToolCalls.length} tool calls)`);

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
        console.error(`[Twilio] Internal agent API error ${agentRes.status}: ${err}`);
        return twimlReply("Something went wrong running the plan. Please try again.");
      }

      const { summary } = await agentRes.json();

      // Clear the pending plan now that it's been actioned
      await updateContext(contextRedis, fromNumber, {
        pendingPlan: null,
        lastThreadId: threadId,
        history: [
          ...ctx.history,
          { role: 'user', content: body },
          { role: 'assistant', content: summary },
        ],
      });

      return twimlReply(summary || "Done.");
    }

    // 5. Free-form agent instruction path — resolve order and run agent
    const mentionedOrder = extractOrderNumber(body);
    const orderNumber = mentionedOrder || ctx.lastOrderNumber;

    if (!orderNumber) {
      return twimlReply("Please include an order number (e.g. #1234) in your message so I know which order to work on.");
    }

    console.log(`[Twilio] ${fromNumber} → org ${organizationId} | order ${orderNumber} | "${body}"`);

    const agentRes = await fetch(`${dashboardUrl}/api/agent/internal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret || '',
      },
      body: JSON.stringify({
        orgId: organizationId,
        instruction: body,
        orderNumber,
        senderPhone: fromNumber,
        clerkUserId: member.clerkUserId,
      }),
    });

    if (!agentRes.ok) {
      const err = await agentRes.text();
      console.error(`[Twilio] Internal agent API error ${agentRes.status}: ${err}`);
      return twimlReply("Something went wrong running the agent. Please try again.");
    }

    const { summary, threadId } = await agentRes.json();

    // 6. Update conversation context for follow-up messages
    await updateContext(contextRedis, fromNumber, {
      lastOrderNumber: orderNumber,
      lastThreadId: threadId,
      history: [
        ...ctx.history,
        { role: 'user', content: body },
        { role: 'assistant', content: summary },
      ],
    });

    return twimlReply(summary || "Done.");

  } catch (error) {
    console.error('[Twilio] Webhook error:', error);
    return twimlReply("An unexpected error occurred. Please try again.");
  }
});

export default router;
