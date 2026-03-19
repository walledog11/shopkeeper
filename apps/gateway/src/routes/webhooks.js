import express from 'express';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const router = express.Router();

// 1. Connect to your local Redis instance
const redisConnection = new IORedis(process.env.REDIS_URL);

// 2. Initialize the BullMQ Queue
const messageQueue = new Queue('inbound-messages', { connection: redisConnection });

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
  const payload = req.body;

  if (payload.object === 'page' || payload.object === 'instagram') {
    try {
      await messageQueue.add('process-ig-dm', {
        platform: 'ig_dm',
        rawPayload: payload
      });

      console.log(`[Webhook] Payload received and queued! Job added to Redis.`);
      return res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
      console.error('[Webhook] Failed to add job to Redis queue:', error);
      return res.sendStatus(500);
    }
  } else {
    return res.sendStatus(404);
  }
});

// -----------------------------------------------------------------------------
// POST: Catching Inbound Emails (SendGrid/Postmark/Mailgun)
// -----------------------------------------------------------------------------
router.post('/email/inbound', async (req, res) => {
  try {
    // Providers usually send the sender, subject, and text body in the payload
    // Note: Adjust these field names based on which email provider you choose!
    const { from, subject, text } = req.body;

    if (!from || !text) {
      return res.sendStatus(400); 
    }

    await messageQueue.add('process-email', {
      platform: 'email',
      senderEmail: from,
      subject: subject || 'No Subject',
      body: text
    });

    console.log(`[Webhook] Inbound email from ${from} queued!`);
    return res.status(200).send('OK');
  } catch (error) {
    console.error('[Webhook] Failed to queue email:', error);
    return res.sendStatus(500);
  }
});

export default router;