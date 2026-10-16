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

export function parseWaitlistSignup(body: Record<string, unknown>) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const [local = "", domain = ""] = email.split("@");
  if (email.length > 254 || local.length > 64 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email) || local.startsWith(".") || local.endsWith(".") || email.includes("..") || domain.split(".").some((label) => label.startsWith("-") || label.endsWith("-") || label.length > 63)) {
    throw new WaitlistInputError("Please enter a valid email address.");
  }
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
