#!/usr/bin/env node
// Read-only: what compensation caps does each workspace actually have, and does
// order #1031's settlement amount clear them?
import { loadLocalEnv } from './load-local-env.mjs';
loadLocalEnv();
const { db } = await import('@shopkeeper/db');
const { resolveAgentSettings } = await import('@shopkeeper/agent/settings');

const orgs = await db.organization.findMany({ select: { id: true, name: true, settings: true } });

// Order #1031, read off the live store: the customer was charged 59.90 CAD and
// the merchant's books show 43.48 USD. The cap is a number the merchant typed in
// their own currency, so the shop figure is the one it judges — comparing it to
// the customer's is the defect this probe used to reproduce.
const SHOP = { amount: 43.48, currency: 'USD' };
const SETTLEMENT = { amount: 59.90, currency: 'CAD' };

for (const org of orgs) {
  const s = resolveAgentSettings(org.settings);
  const per = s.maxRefundAmount;
  const verdict = per === null || per <= 0
    ? 'no per-call cap — passes'
    : (SHOP.amount > per
        ? `BLOCKS ${SHOP.amount} ${SHOP.currency} (cap ${per})`
        : `passes ${SHOP.amount} ${SHOP.currency} (cap ${per})`);
  const wouldHave = per !== null && per > 0 && SETTLEMENT.amount > per && SHOP.amount <= per
    ? '   [old code refused this: compared 59.90 CAD to the cap]'
    : '';
  console.log(`${org.name ?? org.id}  tier=${s.autonomyTier}  maxRefundAmount=${per}  dailyRefundCap=${s.dailyRefundCap}  → ${verdict}${wouldHave}`);
}
await db.$disconnect();
