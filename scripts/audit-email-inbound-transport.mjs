// Email inbound steady-state Phase 0/2 inventory (READ-ONLY).
//
// Reports orgs with both active Gmail and Postmark email integrations and flags
// configurations where native Gmail sync is enabled alongside an active Postmark row.
//
//   npm run audit:email-inbound-transport
//   npm run audit:email-inbound-transport -- --strict
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const { computeEmailInboundTransportAuditReport, db } = await import('@shopkeeper/db');

const strict = process.argv.includes('--strict');

try {
  const report = await computeEmailInboundTransportAuditReport(db, {
    inboundEmailDomain: process.env.INBOUND_EMAIL_DOMAIN,
  });

  console.log(JSON.stringify(report, null, 2));

  if (strict && !report.safeToBeginPhase1Ops) {
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
