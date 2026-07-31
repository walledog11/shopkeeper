// P9-02 legacy customer iMessage thread gate (READ-ONLY).
//
// Operator iMessage uses ChannelType.sms_agent and org_member_imessage_bindings.
// Pre-rewire customer-support rows used ChannelType.imessage and are safe to
// retire once this audit reports zero active legacy threads.
//
//   npm run audit:legacy-imessage-threads
//   npm run audit:legacy-imessage-threads -- --strict
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const { db, ChannelType } = await import('@shopkeeper/db');

const strict = process.argv.includes('--strict');

const [activeLegacyThreads, softDeletedLegacyThreads, activeSmsAgentThreads, imessageBindings] =
  await Promise.all([
    db.thread.count({ where: { channelType: ChannelType.imessage, deletedAt: null } }),
    db.thread.count({ where: { channelType: ChannelType.imessage, deletedAt: { not: null } } }),
    db.thread.count({ where: { channelType: ChannelType.sms_agent, deletedAt: null } }),
    db.orgMemberImessageBinding.count(),
  ]);

const report = {
  generatedAt: new Date().toISOString(),
  activeLegacyThreads,
  softDeletedLegacyThreads,
  activeSmsAgentThreads,
  imessageBindings,
  safeToRetirePurgeTooling:
    activeLegacyThreads === 0 && softDeletedLegacyThreads === 0,
};

console.log(JSON.stringify(report, null, 2));

if (strict && !report.safeToRetirePurgeTooling) {
  process.exitCode = 1;
}

await db.$disconnect();
