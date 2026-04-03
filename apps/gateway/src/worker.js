import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { db } from '@clerk/db';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import twilio from 'twilio';
import { updateContext } from './sms-context.js';

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

  // Save the new message and invalidate the cached plan atomically
  await db.$transaction([
    db.message.create({
      data: { threadId: thread.id, senderType: 'customer', contentText: messageText },
    }),
    db.thread.update({
      where: { id: thread.id },
      data: { cachedPlanMessageId: null, cachedPlan: null },
    }),
  ]);

  const updatedThread = await generateThreadIntelligence(thread.id);
  const aiSummary = updatedThread?.aiSummary ?? null;

  // Non-blocking: send WhatsApp plan notification to verified org members
  sendWhatsAppPlanNotification(organizationId, thread.id, customer.name ?? null, channelType, aiSummary);

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
          Also choose exactly one tag from this list: Shipping, Returns, Order Status, Product Inquiry, General.
          You must respond ONLY in strict JSON format like this: {"summary": "...", "tag": "..."}`
        },
        { role: 'user', content: conversationText },
      ],
      response_format: { type: 'json_object' },
    });

    const aiData = JSON.parse(aiResponse.choices[0].message.content);

    const updated = await db.thread.update({
      where: { id: threadId },
      data: { aiSummary: aiData.summary, tag: aiData.tag },
    });

    console.log(`[Worker] AI Summary saved: [${aiData.tag}] ${aiData.summary}`);
    return updated;
  } catch (aiError) {
    console.error('[Worker] Failed to generate AI summary:', aiError);
    return null;
  }
}

// ── WhatsApp plan notification ────────────────────────────────────────────────

const PLAN_REDIS = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

/**
 * Format an AgentPlan as a readable WhatsApp message.
 * @param {string} customerName
 * @param {string} channelType
 * @param {string} summary
 * @param {Array<{label: string, description: string, category: string, enabled: boolean}>} steps
 * @returns {string}
 */
function formatPlanMessage(customerName, channelType, summary, steps) {
  const channel = channelType === 'ig_dm' ? 'Instagram DM' : channelType.charAt(0).toUpperCase() + channelType.slice(1);
  const actionableSteps = steps.filter(s => s.category !== 'read');

  const stepLines = actionableSteps.map((s, i) => {
    const tag = s.category === 'action' ? 'Shopify' : s.category === 'communication' ? 'Reply' : 'Internal';
    const desc = s.description ? ` — ${s.description}` : '';
    return `${i + 1}. [${tag}] ${s.label}${desc}`;
  });

  const lines = [
    `New ticket — ${channel}`,
    customerName ? `From: ${customerName}` : null,
    `"${summary}"`,
    '',
    `Proposed plan (${actionableSteps.length} step${actionableSteps.length !== 1 ? 's' : ''}):`,
    ...stepLines,
    '',
    'Reply *run* to execute · *dismiss* to ignore',
  ];

  return lines.filter(l => l !== null).join('\n');
}

/**
 * Generate a plan and send a WhatsApp notification to all verified org members.
 * Failures are swallowed so a Twilio/network error never drops an inbound message.
 * @param {string} organizationId
 * @param {string} threadId
 * @param {string} customerName
 * @param {string} channelType
 * @param {string|null} aiSummary
 */
async function sendWhatsAppPlanNotification(organizationId, threadId, customerName, channelType, aiSummary) {
  try {
    const dashboardUrl = process.env.DASHBOARD_INTERNAL_URL || 'http://localhost:3000';
    const internalSecret = process.env.INTERNAL_API_SECRET;

    // Fetch the plan from the dashboard
    const planRes = await fetch(`${dashboardUrl}/api/agent/plan-internal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret || '',
      },
      body: JSON.stringify({ orgId: organizationId, threadId }),
    });

    if (!planRes.ok) {
      console.warn(`[Worker] plan-internal failed (${planRes.status}) for thread ${threadId} — skipping WhatsApp notification.`);
      return;
    }

    const { plan, instruction } = await planRes.json();

    if (!plan || !plan.steps || plan.steps.length === 0) {
      console.log(`[Worker] No plan steps for thread ${threadId} — skipping notification.`);
      return;
    }

    // Find all org members with a verified phone number
    const members = await db.orgMember.findMany({
      where: { organizationId, phoneVerified: true, phoneNumber: { not: null } },
      select: { phoneNumber: true },
    });

    if (members.length === 0) {
      console.log(`[Worker] No verified members for org ${organizationId} — skipping WhatsApp notification.`);
      return;
    }

    const summary = aiSummary || instruction;
    const message = formatPlanMessage(customerName, channelType, summary, plan.steps);

    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER; // e.g. whatsapp:+14155238886

    if (!twilioAccountSid || !twilioAuthToken || !twilioWhatsAppNumber) {
      console.warn('[Worker] Twilio env vars not set — skipping WhatsApp notification.');
      return;
    }

    const twilioClient = twilio(twilioAccountSid, twilioAuthToken);

    for (const member of members) {
      const toNumber = `whatsapp:${member.phoneNumber}`;
      try {
        await twilioClient.messages.create({
          from: twilioWhatsAppNumber,
          to: toNumber,
          body: message,
        });

        // Store the pending plan in Redis so the member can approve via "run"
        await updateContext(PLAN_REDIS, member.phoneNumber, {
          pendingPlan: {
            threadId,
            instruction,
            rawToolCalls: plan.rawToolCalls,
          },
        });

        console.log(`[Worker] WhatsApp notification sent to ${member.phoneNumber} for thread ${threadId}`);
      } catch (sendErr) {
        console.error(`[Worker] Failed to send WhatsApp to ${member.phoneNumber}:`, sendErr.message);
      }
    }
  } catch (err) {
    console.error(`[Worker] sendWhatsAppPlanNotification error for thread ${threadId}:`, err.message);
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
            `https://graph.facebook.com/v22.0/${senderId}?fields=name,profile_pic&access_token=${integration.accessToken}`
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

// ─── Daily Instagram Token Health Check ────────────────────────────────────────

const tokenHealthQueue = new Queue('token-health', { connection: redisConnection });

// Register the repeatable job once on startup (BullMQ deduplicates by jobId)
await tokenHealthQueue.add(
  'check-ig-tokens',
  {},
  {
    repeat: { every: 24 * 60 * 60 * 1000 }, // every 24 hours
    jobId: 'ig-token-health-daily',
  }
);

const FB_GRAPH = 'https://graph.facebook.com/v22.0';

const tokenHealthWorker = new Worker('token-health', async () => {
  console.log('[TokenHealth] Running daily Instagram token check...');

  const igIntegrations = await db.integration.findMany({
    where: { platform: 'ig_dm', accessToken: { not: null } },
    select: { id: true, organizationId: true, externalAccountId: true, accessToken: true, tokenExpiresAt: true },
  });

  console.log(`[TokenHealth] Checking ${igIntegrations.length} ig_dm integration(s)...`);

  for (const integration of igIntegrations) {
    try {
      // Verify the token is still valid with a lightweight API call
      const res = await fetch(
        `${FB_GRAPH}/${integration.externalAccountId}?fields=id&access_token=${integration.accessToken}`
      );
      const data = await res.json();

      if (data.error) {
        console.error(`[TokenHealth] ⚠️  Token invalid for org ${integration.organizationId} (${integration.externalAccountId}):`, data.error.message);
        continue;
      }

      // Token is healthy — extend the tracked expiry another 60 days
      await db.integration.update({
        where: { id: integration.id },
        data: { tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) },
      });

      const daysLeft = integration.tokenExpiresAt
        ? Math.round((new Date(integration.tokenExpiresAt).getTime() - Date.now()) / 86_400_000)
        : 'unknown';

      console.log(`[TokenHealth] ✓ org ${integration.organizationId} — token healthy (was ${daysLeft}d remaining, reset to 60d)`);
    } catch (err) {
      console.error(`[TokenHealth] Failed to check token for org ${integration.organizationId}:`, err.message);
    }
  }

  console.log('[TokenHealth] Daily check complete.');
}, { connection: redisConnection });

tokenHealthWorker.on('failed', (job, err) => {
  console.error('[TokenHealth] Job failed:', err.message);
});

console.log('[Worker] Engine started. Listening for incoming messages...');
