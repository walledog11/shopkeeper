// P9-02 operator_context compatibility gate (READ-ONLY).
//
// Reports legacy pending-plan storage and tool-call JSON shapes that block
// retiring compatibility readers in apps/gateway/src/operator-context.ts.
//
//   npm run audit:operator-context-compatibility
//   npm run audit:operator-context-compatibility -- --strict
import { loadLocalEnv } from './load-local-env.mjs';
import { summarizeOperatorContextCompatibility } from './operator-context-compat-lib.mjs';

loadLocalEnv();

const { db } = await import('@shopkeeper/db');

const strict = process.argv.includes('--strict');

const rows = await db.operatorContext.findMany({
  select: {
    pendingPlans: true,
  },
});

const report = {
  generatedAt: new Date().toISOString(),
  ...summarizeOperatorContextCompatibility(rows),
};

console.log(JSON.stringify(report, null, 2));

if (strict && !report.safeToRetireLegacyToolCallShape) {
  process.exitCode = 1;
}

await db.$disconnect();
