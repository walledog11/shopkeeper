import { auth } from "@clerk/nextjs/server";
import { db, serializeMerchantPreference } from "@shopkeeper/db";
import type { MerchantPreferenceRecord } from "@shopkeeper/db";

export interface MerchantPreferencesPageData {
  active: MerchantPreferenceRecord[];
  proposed: MerchantPreferenceRecord[];
}

export async function getMerchantPreferencesPageData(
  organizationId: string,
): Promise<MerchantPreferencesPageData> {
  const rows = await db.merchantPreference.findMany({
    where: {
      organizationId,
      status: { in: ["active", "proposed"] },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  const active: MerchantPreferenceRecord[] = [];
  const proposed: MerchantPreferenceRecord[] = [];
  for (const row of rows) {
    const record = serializeMerchantPreference(row);
    if (record.status === "active") active.push(record);
    if (record.status === "proposed") proposed.push(record);
  }

  return { active, proposed };
}

export async function requireClerkUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}
