import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KNIP_BIN = fileURLToPath(new URL('../node_modules/knip/bin/knip.js', import.meta.url));
const WARNING_BASELINE = {
  exports: 151,
  // Ratcheted 121 -> 116 when find_customer replaced the two customer reads and
  // their input shapes stopped being a tool contract. A deletion that does not
  // move the ceiling down leaves the ceiling paying for surface nobody has.
  types: 116,
};

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

const counts = countIssues(report.issues ?? []);
const baselineGrowth = Object.entries(WARNING_BASELINE).filter(
  ([issueType, maximum]) => (counts[issueType] ?? 0) > maximum,
);

if ((result.status ?? 1) !== 0 || baselineGrowth.length > 0) {
  if (baselineGrowth.length > 0) {
    console.error(
      `[knip] Warning baseline grew: ${baselineGrowth
        .map(([issueType, maximum]) => `${issueType}=${counts[issueType]}/${maximum}`)
        .join(', ')}`,
    );
  }

  spawnSync(process.execPath, [KNIP_BIN], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(1);
}

console.log(
  `[knip] Blocking rules clean; reviewed warning baseline: exports=${counts.exports ?? 0}/${WARNING_BASELINE.exports}, types=${counts.types ?? 0}/${WARNING_BASELINE.types}.`,
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
