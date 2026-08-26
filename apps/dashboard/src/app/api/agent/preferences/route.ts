import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  MERCHANT_PREFERENCE_ACTIVE_LIMIT,
  db,
  parseMerchantPreferenceCreateBody,
  serializeMerchantPreference,
} from "@shopkeeper/db";
import { readRequiredJsonObject } from "@/lib/api/body";
import { BadRequestError } from "@/lib/api/errors";
import { withOrgRoute } from "@/lib/api/route";
import {
  getMerchantPreferencesPageData,
  requireClerkUserId,
} from "@/lib/server/merchant-preferences-data";

export const GET = withOrgRoute(
  { context: "Merchant preferences GET", errorMessage: "Failed to fetch merchant preferences" },
  async ({ org }) => NextResponse.json(await getMerchantPreferencesPageData(org.id)),
);

export const POST = withOrgRoute(
  {
    context: "Merchant preferences POST",
    errorMessage: "Failed to create merchant preference",
    requireAdmin: true,
    requireBillingWriteAllowed: true,
  },
  async ({ org, request }) => {
    let parsed;
    try {
      parsed = parseMerchantPreferenceCreateBody(await readRequiredJsonObject(request));
    } catch (error) {
      throw new BadRequestError(error instanceof Error ? error.message : "Invalid request");
    }

    const activeCount = await db.merchantPreference.count({
      where: { organizationId: org.id, status: "active" },
    });
    if (activeCount >= MERCHANT_PREFERENCE_ACTIVE_LIMIT) {
      throw new BadRequestError(`You can keep at most ${MERCHANT_PREFERENCE_ACTIVE_LIMIT} active preferences. Archive one before adding another.`);
    }

    const clerkUserId = await requireClerkUserId();
    const now = new Date();
    const created = await db.merchantPreference.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        category: parsed.category,
        guidance: parsed.guidance,
        source: "explicit",
        status: "active",
        confirmedAt: now,
        confirmedByClerkUserId: clerkUserId,
      },
    });

    return NextResponse.json({ preference: serializeMerchantPreference(created) }, { status: 201 });
  },
);
