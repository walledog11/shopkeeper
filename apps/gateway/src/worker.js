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

// --- Strip quoted reply chains from email bodies ---
// Handles the most common email client formats:
//   "On [date], [name] wrote:" (Gmail, Apple Mail, Outlook)
//   Lines prefixed with ">"
//   "-----Original Message-----"
function stripQuotedReply(text) {
  if (!text) return text;

  return text
    .replace(/\r\n/g, '\n')
    // "On [date], [name] <email> wrote:" and everything after (with optional leading >)
    .replace(/^>?\s*On\s.{5,200}wrote:\s*[\s\S]*/im, '')
    // "-----Original Message-----" and everything after
    .replace(/^-{3,}\s*Original Message\s*-{3,}[\s\S]*/im, '')
    // Remaining lines that start with ">" (quoted lines)
    .replace(/^>.*$/gm, '')
    // Collapse multiple blank lines left behind
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- AI Filter for Emails ---
async function isCustomerSupportMessage(subject, body) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a strict email filter for a customer support helpdesk.
          Analyze the email subject and body.
          Return ONLY "true" if it is a real person reaching out for help, asking a question, making a complaint, or needing support.
          Return ONLY "false" if it is spam, a newsletter, a promotional email, an automated system alert, or a delivery status notification.`
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
    console.error("[Worker] AI Filter failed — failing open to avoid dropping emails", error);
    return true;
  }
}

// Shared handler: upsert customer → find/create thread → save message → summarize
// organizationId scopes all writes so data never crosses tenant boundaries
async function processInboundMessage(organizationId, platformId, channelType, messageText, { customerName = null, profilePicUrl = null, initialTag = null } = {}) {
  // Upsert by the compound unique key (organizationId + platformId)
  const customer = await db.customer.upsert({
    where: {
      organizationId_platformId: { organizationId, platformId },
    },
    update: {
      ...(customerName && { name: customerName }),
      ...(profilePicUrl && { profilePicUrl }),
    },
    create: {
      organizationId,
      platformId,
      ...(customerName && { name: customerName }),
      ...(profilePicUrl && { profilePicUrl }),
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
          content: `You are an AI assistant for a customer support team.
          Read the following customer service transcript.
          Provide a 1-sentence summary of the customer's core issue.
          Also provide a 1-to-2 word category tag (e.g., 'Returns', 'Billing', 'Shipping Delay', 'Product Inquiry', 'Technical Issue').
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
    const entry = rawPayload.entry?.[0];
    // Instagram webhooks use either entry.messaging[] or entry.changes[].value
    const messagingEvent = entry?.messaging?.[0] ?? entry?.changes?.[0]?.value;

    if (!messagingEvent || !messagingEvent.message || !messagingEvent.message.text) return;
    // Skip echo messages — Meta reflects back any message the page itself sends
    if (messagingEvent.message.is_echo) return;

    const senderId = messagingEvent.sender.id;
    const messageText = messagingEvent.message.text;

    try {
      // Fetch the Instagram user's display name and profile picture via the Meta Graph API
      let igName = null;
      let igProfilePic = null;
      try {
        const integration = await db.integration.findFirst({
          where: { organizationId, platform: 'ig_dm' },
          select: { accessToken: true },
        });
        if (integration?.accessToken) {
          const profileRes = await fetch(
            `https://graph.facebook.com/v19.0/${senderId}?fields=name,profile_pic&access_token=${integration.accessToken}`
          );
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            igName = profileData.name || null;
            igProfilePic = profileData.profile_pic || null;
          }
        }
      } catch (profileErr) {
        console.warn(`[Worker] Failed to fetch IG profile for ${senderId}:`, profileErr.message);
      }

      await processInboundMessage(organizationId, senderId, 'ig_dm', messageText, {
        customerName: igName,
        profilePicUrl: igProfilePic,
      });
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
    const { senderEmail, senderName, subject, body } = job.data;

    try {
      // Skip the AI filter if this sender already has an open thread —
      // they're an existing customer continuing a conversation.
      const existingCustomer = await db.customer.findUnique({
        where: { organizationId_platformId: { organizationId, platformId: senderEmail } },
        select: { id: true },
      });

      const hasOpenThread = existingCustomer
        ? await db.thread.findFirst({
            where: { organizationId, customerId: existingCustomer.id, status: 'open', channelType: 'email' },
            select: { id: true },
          })
        : null;

      if (!hasOpenThread) {
        const isCustomer = await isCustomerSupportMessage(subject, body);
        if (!isCustomer) {
          console.log(`[Worker] AI dropped non-customer email from ${senderEmail}`);
          return;
        }
      }

      const cleanBody = stripQuotedReply(body);

      await processInboundMessage(organizationId, senderEmail, 'email', cleanBody, {
        customerName: senderName || senderEmail.split('@')[0],
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
