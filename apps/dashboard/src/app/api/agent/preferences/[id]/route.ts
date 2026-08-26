import { NextResponse } from "next/server";
import { db, parseMerchantPreferencePatchBody, serializeMerchantPreference } from "@shopkeeper/db";
import { readRequiredJsonObject } from "@/lib/api/body";
import { BadRequestError } from "@/lib/api/errors";
import { withOrgRoute, assertEntityInOrg } from "@/lib/api/route";
import { requireClerkUserId } from "@/lib/server/merchant-preferences-data";

export const PATCH = withOrgRoute<{ id: string }>(
  {
    context: "Merchant preference PATCH",
    errorMessage: "Failed to update merchant preference",
    requireAdmin: true,
    requireBillingWriteAllowed: true,
  },
  async ({ org, request, params }) => {
    let parsed;
    try {
      parsed = parseMerchantPreferencePatchBody(await readRequiredJsonObject(request));
    } catch (error) {
      throw new BadRequestError(error instanceof Error ? error.message : "Invalid request");
    }

    const preference = await db.merchantPreference.findUnique({
      where: { id: params.id },
    });
    assertEntityInOrg(preference, org.id);

    if (parsed.action === "archive") {
      if (preference.status !== "active") {
        throw new BadRequestError("Only active preferences can be archived");
      }
      const updated = await db.merchantPreference.update({
        where: { id: preference.id },
        data: { status: "archived" },
      });
      return NextResponse.json({ preference: serializeMerchantPreference(updated) });
    }

    if (preference.status !== "proposed") {
      throw new BadRequestError("Only proposed preferences can be confirmed or rejected");
    }

    const clerkUserId = await requireClerkUserId();
    const now = new Date();
    const updated = await db.merchantPreference.update({
      where: { id: preference.id },
      data: parsed.action === "confirm"
        ? {
            status: "active",
            confirmedAt: now,
            confirmedByClerkUserId: clerkUserId,
          }
        : { status: "rejected" },
    });

    return NextResponse.json({ preference: serializeMerchantPreference(updated) });
  },
);
