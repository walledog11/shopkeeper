import type { Prisma } from "@prisma/client";
import { isStorefrontChatEnabledForIntegration } from "./enabled";


import { isRecord } from "@shopkeeper/agent/guards";
export function readStorefrontChatEnabled(metadata: unknown): boolean {
  return isStorefrontChatEnabledForIntegration(metadata);
}

export function mergeStorefrontChatEnabled(
  existingMetadata: unknown,
  enabled: boolean,
): Prisma.InputJsonObject {
  const existing = isRecord(existingMetadata) ? existingMetadata : {};
  const existingStorefront = isRecord(existing.storefrontChat) ? existing.storefrontChat : {};
  return {
    ...existing,
    storefrontChat: {
      ...existingStorefront,
      enabled,
    },
  } as Prisma.InputJsonObject;
}
