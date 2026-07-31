// P9-02 synchronous outbound-email rollback gate (READ-ONLY).
//
// The sync dashboard path remains until async rollout evidence and an explicit
// async-only date are recorded. This script documents the current mode only.
//
//   npm run audit:outbound-email-mode
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const raw = process.env.OUTBOUND_EMAIL_ASYNC;
const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
const asyncEnabled = normalized === 'true' || normalized === '1' || normalized === 'yes';

const report = {
  generatedAt: new Date().toISOString(),
  outboundEmailAsync: raw ?? null,
  asyncEnabled,
  syncRollbackRailActive: !asyncEnabled,
  safeToRetireSyncPath: false,
  note: 'Retire the synchronous path only after P4-01 recovery exercises complete and launch owner sets an async-only date.',
};

console.log(JSON.stringify(report, null, 2));
