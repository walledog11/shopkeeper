import { WAITLIST_CHANNELS, WAITLIST_VOLUMES, type WaitlistChannel, type WaitlistVolume } from "@/lib/waitlist-profile";

export class WaitlistInputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function readWaitlistBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new WaitlistInputError("Please enter your email address.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new WaitlistInputError("That submission is too long.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new WaitlistInputError("Please check your email and try again."); }
}

function parseEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  const [local = "", domain = ""] = email.split("@");
  if (email.length > 254 || local.length > 64 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email) || local.startsWith(".") || local.endsWith(".") || email.includes("..") || domain.split(".").some((label) => label.startsWith("-") || label.endsWith("-") || label.length > 63)) {
    throw new WaitlistInputError("Please enter a valid email address.");
  }
  return email;
}

export function parseWaitlistSignup(body: Record<string, unknown>) {
  const email = parseEmail(body.email);
  const attribution: Record<string, string> = {};
  if (body.attribution && typeof body.attribution === "object" && !Array.isArray(body.attribution)) {
    const input = body.attribution as Record<string, unknown>;
    for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
      const value = input[key];
      if (typeof value === "string" && value.trim()) attribution[key] = value.trim().slice(0, 200);
    }
  }
  return { email, source: body.source === "footer" ? "footer" : "hero", attribution, newsletterOptIn: body.newsletterOptIn === true };
}

// Stored as the bare host ("shop.com", "shop.myshopify.com"), however it was typed.
function parseStoreHost(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  let host = "";
  if (raw && raw.length <= 255) {
    try {
      host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, "");
    } catch { host = ""; }
  }
  if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) {
    throw new WaitlistInputError("Please enter your store’s web address, like yourstore.com.");
  }
  return host;
}

const CHANNEL_CODES = new Set<string>(WAITLIST_CHANNELS.map((channel) => channel.code));
const VOLUME_CODES = new Set<string>(WAITLIST_VOLUMES.map((volume) => volume.code));

export function parseWaitlistProfile(body: Record<string, unknown>) {
  const email = parseEmail(body.email);
  const storeUrl = parseStoreHost(body.storeUrl);
  const channels = body.channels ?? [];
  if (!Array.isArray(channels) || channels.some((code) => typeof code !== "string" || !CHANNEL_CODES.has(code))) {
    throw new WaitlistInputError("Please choose where customers message you from the list.");
  }
  const weeklyMessages = body.weeklyMessages ?? null;
  if (weeklyMessages !== null && (typeof weeklyMessages !== "string" || !VOLUME_CODES.has(weeklyMessages))) {
    throw new WaitlistInputError("Please choose how many messages you get a week from the list.");
  }
  return {
    email,
    storeUrl,
    channels: [...new Set(channels as WaitlistChannel[])],
    weeklyMessages: weeklyMessages as WaitlistVolume | null,
  };
}
