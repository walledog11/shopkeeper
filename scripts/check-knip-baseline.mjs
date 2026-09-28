import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Unused files, dependencies, unlisted imports, binaries and duplicate exports
// are knip errors and fail the static stage, which gates Build, Integration and
// E2E. Unused exports and types are warnings: their counts are printed, never
// enforced. A ratchet on them alone caused 16 of the 31 knip-red CI runs between
// 2026-08-21 and 2026-09-28.
const KNIP_BIN = fileURLToPath(new URL('../node_modules/knip/bin/knip.js', import.meta.url));

const result = spawnSync(process.execPath, [KNIP_BIN, '--reporter', 'json'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: process.env,
});

if (result.error) throw result.error;

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  process.stderr.write(result.stderr);
  process.stderr.write(result.stdout);
  throw new Error('[knip] Could not parse the JSON report.');
}

if ((result.status ?? 1) !== 0) {
  spawnSync(process.execPath, [KNIP_BIN], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(1);
}

const counts = countIssues(report.issues ?? []);
console.log(
  `[knip] Blocking rules clean; warnings only: unused exports=${counts.exports ?? 0}, types=${counts.types ?? 0}.`,
);

function countIssues(issues) {
  const counts = {};
  for (const issue of issues) {
    for (const [issueType, findings] of Object.entries(issue)) {
      if (issueType === 'file' || !Array.isArray(findings)) continue;
      counts[issueType] = (counts[issueType] ?? 0) + findings.length;
    }
  }
  return counts;
}
