import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { db } from '@clerk/db';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const redisConnection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// --- AI Filter for Emails ---
async function isCustomerSupportMessage(subject, body) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a strict email filter for a clothing brand's customer support helpdesk.
          Analyze the email subject and body.
          Return ONLY "true" if it is a real customer asking a question, making a complaint, inquiring about an order, or needing help.
          Return ONLY "false" if it is spam, a newsletter, a promotional email, an internal company memo, or an automated system alert.`
        },
        {
          role: 'user',
          content: `Subject: ${subject}\n\nBody: ${body}`
        }
      ],
      temperature: 0.1,
    });

    const decision = response.choices[0].message.content.trim().toLowerCase();
    return decision === 'true';

  } catch (error) {
    console.error("[Worker] AI Filter failed", error);
    return false;
  }
}

// Shared handler: upsert customer → find/create thread → save message → summarize
// organizationId scopes all writes so data never crosses tenant boundaries
async function processInboundMessage(organizationId, platformId, channelType, messageText, { customerName = null, initialTag = null } = {}) {
  // Upsert by the compound unique key (organizationId + platformId)
  const customer = await db.customer.upsert({
    where: {
      organizationId_platformId: { organizationId, platformId },
    },
    update: {},
    create: {
      organizationId,
      platformId,
      ...(customerName && { name: customerName }),
    },
  });

  let thread = await db.thread.findFirst({
    where: { organizationId, customerId: customer.id, status: 'open', channelType },
  });

  if (!thread) {
    thread = await db.thread.create({
      data: {
        organizationId,
        customerId: customer.id,
        channelType,
        status: 'open',
        ...(initialTag && { tag: initialTag }),
      },
    });
  }

  await db.message.create({
    data: { threadId: thread.id, senderType: 'customer', contentText: messageText },
  });

  await generateThreadIntelligence(thread.id);
  return thread;
}

// Helper to generate AI summary and tag for a thread
async function generateThreadIntelligence(threadId) {
  try {
    console.log(`[Worker] Generating AI Summary for thread ${threadId}...`);
    const fullThread = await db.thread.findUnique({
      where: { id: threadId },
      include: { messages: { orderBy: { sentAt: 'asc' } } },
    });

    const conversationText = fullThread.messages
      .map(m => `${m.senderType.toUpperCase()}: ${m.contentText}`)
      .join('\n');

    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an AI assistant for a clothing brand.
          Read the following customer service transcript.
          Provide a 1-sentence summary of the customer's core issue.
          Also provide a 1-to-2 word category tag (e.g., 'Returns', 'Sizing', 'Shipping Delay', 'Product Inquiry').
          You must respond ONLY in strict JSON format like this: {"summary": "...", "tag": "..."}`
        },
        { role: 'user', content: conversationText },
      ],
      response_format: { type: 'json_object' },
    });

    const aiData = JSON.parse(aiResponse.choices[0].message.content);

    await db.thread.update({
      where: { id: threadId },
      data: { aiSummary: aiData.summary, tag: aiData.tag },
    });

    console.log(`[Worker] AI Summary saved: [${aiData.tag}] ${aiData.summary}`);
  } catch (aiError) {
    console.error('[Worker] Failed to generate AI summary:', aiError);
  }
}

const messageWorker = new Worker('inbound-messages', async (job) => {
  console.log(`[Worker] Picked up job ${job.id} for platform: ${job.data.platform}`);

  const { organizationId } = job.data;

  if (!organizationId) {
    console.error(`[Worker] Job ${job.id} is missing organizationId — dropping.`);
    return;
  }

  // -------------------------------------------------------------
  // BRANCH 1: INSTAGRAM DMs
  // -------------------------------------------------------------
  if (job.data.platform === 'ig_dm') {
    const { rawPayload } = job.data;
    const messagingEvent = rawPayload.entry[0]?.messaging[0];

    if (!messagingEvent || !messagingEvent.message || !messagingEvent.message.text) return;

    const senderId = messagingEvent.sender.id;
    const messageText = messagingEvent.message.text;

    try {
      await processInboundMessage(organizationId, senderId, 'ig_dm', messageText);
      console.log(`[Worker] Successfully saved IG DM from ${senderId} for org ${organizationId}`);
    } catch (error) {
      console.error(`[Worker] DB operation failed for IG DM:`, error);
      throw error;
    }
  }

  // -------------------------------------------------------------
  // BRANCH 2: EMAILS
  // -------------------------------------------------------------
  else if (job.data.platform === 'email') {
    const { senderEmail, subject, body } = job.data;

    try {
      const isCustomer = await isCustomerSupportMessage(subject, body);

      if (!isCustomer) {
        console.log(`[Worker] AI dropped non-customer email from ${senderEmail}`);
        return;
      }

      await processInboundMessage(organizationId, senderEmail, 'email', body, {
        customerName: senderEmail.split('@')[0],
        initialTag: subject.substring(0, 50),
      });
      console.log(`[Worker] Successfully saved Email from ${senderEmail} for org ${organizationId}`);

    } catch (error) {
      console.error(`[Worker] DB operation failed for Email:`, error);
      throw error;
    }
  }
}, { connection: redisConnection });

messageWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed permanently:`, err.message);
});

console.log('[Worker] Engine started. Listening for incoming messages...');
