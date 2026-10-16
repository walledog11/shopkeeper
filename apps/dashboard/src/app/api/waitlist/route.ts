import { createHash } from "node:crypto";
import { after } from "next/server";
import { db } from "@shopkeeper/db";
import { getWaitlistLoopsConfig, processWaitlistSync } from "@shopkeeper/email/waitlist";
import logger from "@/lib/server/logger";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { parseWaitlistSignup, readWaitlistBody, WaitlistInputError } from "./_lib/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

function json(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "Please join from the Shopkeeper website." }, 403);
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Please use the waitlist form." }, 415);
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  const key = createHash("sha256").update(ip).digest("hex").slice(0, 24);
  const limit = await rateLimit(`waitlist:${key}`, 10, 600);
  if (!limit.success) return tooManyRequests(limit.reset);

  try {
    const body = await readWaitlistBody(request);
    if (body.company) return json({ success: true });
    const signup = parseWaitlistSignup(body);
    // A unique normalized email also deduplicates concurrent requests. Preserve
    // the original attribution and give new/repeat signups the same response.
    await db.waitlistEntry.createMany({ data: [{
      ...signup,
      consentVersion: "waitlist-updates-v2",
      newsletterConsentAt: signup.newsletterOptIn ? new Date() : null,
    }], skipDuplicates: true });
    let confirmationRequired = false;
    try { confirmationRequired = getWaitlistLoopsConfig() !== null; }
    catch { logger.error({ event: "waitlist_loops_config_invalid" }, "Waitlist saved; email sync needs configuration"); }
    if (confirmationRequired) {
      const entry = await db.waitlistEntry.findUniqueOrThrow({ where: { email: signup.email }, select: { id: true } });
      after(async () => {
        try { await processWaitlistSync({ id: entry.id }); }
        catch { logger.error({ event: "waitlist_sync_deferred" }, "Waitlist sync will retry in the worker"); }
      });
    }
    return json({ success: true, confirmationRequired });
  } catch (error) {
    if (error instanceof WaitlistInputError) return json({ error: error.message }, error.status);
    logger.error({ event: "waitlist_save_failed" }, "Could not save waitlist signup");
    return json({ error: "We couldn’t save your email. Please try again in a moment." }, 503);
  }
}
