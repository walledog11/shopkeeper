/**
 * Operator-channel bind completion.
 *
 * When a merchant links their first operator channel (Telegram or iMessage),
 * the agent introduces itself in its own voice and quietly switches on the
 * morning digest — including a guaranteed first briefing the next morning, even
 * if no tickets have come in yet (see `firstBriefingPending` in the digest
 * worker). Re-binding an already-active org is a no-op on settings.
 */

import { db } from '@shopkeeper/db';
import type { Prisma } from '@prisma/client';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import logger from './logger.js';
import { listOperatorBindings } from './operator-notify.js';

export interface BindWelcomeParams {
  agentName: string;
  storeName: string | null;
}

export function buildBindWelcome({ agentName, storeName }: BindWelcomeParams): string {
  const store = storeName?.trim() ? `${storeName.trim()}'s inbox` : 'your inbox';
  return [
    `Hi — it's ${agentName}. We're connected, and I'm watching ${store} from now on.`,
    '',
    "When something needs your call I'll text you here first. Every morning you'll get a rundown of what came in overnight and what I handled.",
    '',
    "Text SUMMARY anytime for your open tickets, HELP for what I can do, or just tell me what you need — like 'refund #1234'.",
  ].join('\n');
}

// Read the org, activate the morning digest on the first operator bind, and
// return the agent's welcome. Called by both bind handlers after the binding
// row is written, so `listOperatorBindings` already counts this channel.
export async function finalizeOperatorBind(organizationId: string): Promise<string> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, settings: true },
  });
  const settings = resolveAgentSettings(org?.settings);

  // First operator channel for this org, and digests never switched on → this
  // is the onboarding bind. Turn on the morning digest and arm the first
  // briefing. Once digestEnabled is true this branch never re-fires.
  const bindings = await listOperatorBindings(organizationId);
  if (bindings.length === 1 && !settings.digestEnabled) {
    const raw = (org?.settings as Record<string, unknown> | null) ?? {};
    await db.organization.update({
      where: { id: organizationId },
      data: {
        settings: {
          ...raw,
          digestEnabled: true,
          firstBriefingPending: true,
        } as Prisma.InputJsonObject,
      },
    });
    logger.info({ organizationId }, '[OperatorOnboarding] First bind — armed morning digest + first briefing');
  }

  return buildBindWelcome({ agentName: settings.agentName, storeName: org?.name ?? null });
}
