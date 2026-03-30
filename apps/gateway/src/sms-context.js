/**
 * SMS Conversation Context Manager
 *
 * Persists per-sender state in Redis so team members can send follow-up
 * messages without repeating order numbers each time.
 *
 * Key:  sms:ctx:{e164PhoneNumber}
 * TTL:  1 hour of inactivity
 */

const CONTEXT_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * @param {import('ioredis').Redis} redis
 * @param {string} phone - E.164 format, e.g. +15551234567
 * @returns {Promise<{ lastOrderNumber: string|null, lastThreadId: string|null, history: {role: string, content: string}[] }>}
 */
export async function getContext(redis, phone) {
  const raw = await redis.get(`sms:ctx:${phone}`);
  if (!raw) return { lastOrderNumber: null, lastThreadId: null, history: [] };
  try {
    return JSON.parse(raw);
  } catch {
    return { lastOrderNumber: null, lastThreadId: null, history: [] };
  }
}

/**
 * @param {import('ioredis').Redis} redis
 * @param {string} phone
 * @param {object} updates - Partial context to merge
 */
export async function updateContext(redis, phone, updates) {
  const current = await getContext(redis, phone);
  const next = { ...current, ...updates };

  // Keep history to last 10 turns to avoid unbounded growth
  if (next.history && next.history.length > 20) {
    next.history = next.history.slice(-20);
  }

  await redis.setex(`sms:ctx:${phone}`, CONTEXT_TTL_SECONDS, JSON.stringify(next));
}

/**
 * @param {import('ioredis').Redis} redis
 * @param {string} phone
 */
export async function clearContext(redis, phone) {
  await redis.del(`sms:ctx:${phone}`);
}

/**
 * Extract the first order number from a message body.
 * Matches formats: #1234, order 1234, order #1234, ORDER-1234
 * Returns null if nothing found.
 *
 * @param {string} text
 * @returns {string|null}
 */
export function extractOrderNumber(text) {
  const match = text.match(/#(\d+)|order[- #]*(\d+)/i);
  if (!match) return null;
  const num = match[1] || match[2];
  return `#${num}`;
}
