import { NextResponse } from "next/server";
import { authorizeStorefrontRequest } from "@/lib/storefront-chat/authorize";
import { requestVerification, submitVerificationCode } from "@/lib/storefront-chat/verification";

const MAX_FIELD_LENGTH = 320;

// Verification runs entirely here rather than through the agent: the shopper's
// challenge and code never enter the plan/approve loop, so neither waits on the
// merchant. The agent only ever observes the result, as a session that is or is
// not verified for a given order.
export async function POST(request: Request) {
  const authorized = await authorizeStorefrontRequest(request);
  if (authorized instanceof NextResponse) return authorized;
  const { session } = authorized;

  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  const orderName =
    typeof body.orderName === "string" ? body.orderName.trim().slice(0, MAX_FIELD_LENGTH) : "";

  if (action === "request") {
    const email = typeof body.email === "string" ? body.email.trim().slice(0, MAX_FIELD_LENGTH) : "";
    if (!orderName || !email) {
      return NextResponse.json({ error: "orderName and email are required" }, { status: 400 });
    }

    const result = await requestVerification({
      sessionId: session.sessionId,
      orgId: session.orgId,
      integrationId: session.integrationId,
      orderName,
      email,
    });
    return NextResponse.json(result);
  }

  if (action === "code") {
    const code = typeof body.code === "string" ? body.code.trim().slice(0, MAX_FIELD_LENGTH) : "";
    if (!orderName || !code) {
      return NextResponse.json({ error: "orderName and code are required" }, { status: 400 });
    }

    const outcome = await submitVerificationCode({
      sessionId: session.sessionId,
      orgId: session.orgId,
      orderName,
      code,
    });
    return NextResponse.json(outcome);
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
