// The production dependency audit CI runs. It fails on every high or critical
// advisory in a production dependency, as `npm audit --omit=dev
// --audit-level=high` did, except one listed in ACCEPTED. An entry names the
// advisory, the package and the install paths it covers, why it is accepted,
// and the day it lapses; from the next day the advisory fails the audit again.
// Anything the audit cannot read fails it too.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

export const ACCEPTED = [
  {
    advisory: 'GHSA-fc5q-39xc-vjpf',
    package: 'picomatch',
    // Sentry's build plugins only: @sentry/nextjs runs them in its
    // `wrappingLoader` during `next build`, and no request path loads them.
    paths: ['node_modules/@rollup/plugin-commonjs/', 'node_modules/@rollup/pluginutils/'],
    reason: 'ReDoS through glob patterns. Every published picomatch (<=4.0.7) is affected, and the newest @sentry/nextjs and @rollup/plugin-commonjs still require picomatch ^4.0.2.',
    expires: '2026-12-01',
  },
];

function advisoryId(via) {
  return via.url?.match(/GHSA(-[0-9a-z]{4}){3}/i)?.[0] ?? `npm advisory ${via.source}`;
}

/**
 * `report` is `npm audit --json` output. Returns the advisories that fail the
 * audit and the accepted ones, each as a printable line.
 */
export function auditVerdict(report, accepted = ACCEPTED, today = new Date().toISOString().slice(0, 10)) {
  if (!report || typeof report !== 'object' || report.error || typeof report.vulnerabilities !== 'object') {
    return {
      blocking: [`npm audit returned no report: ${JSON.stringify(report?.error ?? report)?.slice(0, 500)}`],
      accepted: [],
    };
  }

  const blocking = [];
  const acceptedLines = [];
  const seen = new Set();
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
    // A string names the package an advisory came through; the advisory itself
    // is reported on that package's own entry.
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== 'object' || !BLOCKING_SEVERITIES.has(via.severity)) continue;
      const id = advisoryId(via);
      if (seen.has(`${id} ${name}`)) continue;
      seen.add(`${id} ${name}`);

      const line = `${name} ${via.range ?? ''} (${via.severity}) ${id}: ${via.title}`;
      const entry = accepted.find((candidate) => candidate.advisory === id && candidate.package === name);
      if (!entry) {
        blocking.push(line);
        continue;
      }
      if (today > entry.expires) {
        blocking.push(`${line}. Its exception lapsed after ${entry.expires}.`);
        continue;
      }
      const nodes = Array.isArray(vulnerability.nodes) ? vulnerability.nodes : [];
      const outside = nodes.filter((node) => !entry.paths.some((path) => node.startsWith(path)));
      if (nodes.length === 0 || outside.length > 0) {
        blocking.push(`${line}. Installed outside its accepted paths: ${outside.join(', ') || 'no install path reported'}.`);
        continue;
      }
      acceptedLines.push(`${line}. Accepted through ${entry.expires}: ${entry.reason}`);
    }
  }
  return { blocking, accepted: acceptedLines };
}

function main() {
  const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;

  let report = null;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    report = { error: { summary: 'unparseable npm audit output', stderr: result.stderr?.slice(0, 500) } };
  }

  const verdict = auditVerdict(report);
  for (const line of verdict.accepted) console.log(`[audit] accepted: ${line}`);
  if (verdict.blocking.length > 0) {
    for (const line of verdict.blocking) console.error(`[audit] blocking: ${line}`);
    process.exit(1);
  }
  console.log(`[audit] No blocking advisory in production dependencies. Counts: ${JSON.stringify(report.metadata?.vulnerabilities ?? {})}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
