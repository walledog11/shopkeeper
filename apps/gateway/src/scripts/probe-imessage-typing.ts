import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

// THROWAWAY — does Photon's cloud iMessage line actually raise a typing
// indicator? `space.startTyping()` is documented as best-effort and silently
// no-ops on platforms without the concept, so the only way to know is to watch
// a real phone. Holds the indicator for ~6s against the bound operator's space.
//
//   ORG_ID=<org> npx tsx apps/gateway/src/scripts/probe-imessage-typing.ts
//
// Sends no message. If the "…" bubble appears, the instant acknowledgement
// works; if not, the 2.5s worded fallback is the only signal that channel has.

async function main() {
  const { db } = await import('@shopkeeper/db');
  const { withImessageTyping } = await import('../clients/spectrum.js');

  const orgId = process.env.ORG_ID?.trim();
  if (!orgId) {
    console.error('Set ORG_ID.');
    process.exit(1);
  }

  const binding = await db.orgMemberImessageBinding.findFirst({
    where: { orgMember: { organizationId: orgId } },
    select: { senderId: true, spaceId: true },
  });
  if (!binding?.spaceId) {
    console.error('No iMessage binding with a space id for that org.');
    process.exit(1);
  }

  console.log(`Raising typing indicator on space ${binding.spaceId} for 6s — watch the phone.`);
  const startedAt = Date.now();
  await withImessageTyping(binding.spaceId, async () => {
    await new Promise((resolve) => setTimeout(resolve, 6000));
  });
  console.log(`Held for ${Date.now() - startedAt}ms with no thrown error.`);
  console.log('If no "…" bubble appeared, the platform no-ops it and the worded fallback carries the load.');

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  const { db } = await import('@shopkeeper/db').catch(() => ({ db: null }));
  await db?.$disconnect().catch(() => {});
  process.exit(1);
});
