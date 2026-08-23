import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument ${key ?? ''}`);
  args.set(key.slice(2), value);
}

const required = name => {
  const value = args.get(name)?.trim();
  if (!value) throw new Error(`--${name} is required`);
  return value;
};
const positiveNumber = name => {
  const value = Number(required(name));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be positive`);
  return value;
};
const positiveInteger = name => {
  const value = positiveNumber(name);
  if (!Number.isSafeInteger(value)) throw new Error(`--${name} must be an integer`);
  return value;
};

const mode = required('mode');
if (!['targeted', 'release', 'drift', 'baseline'].includes(mode)) {
  throw new Error(`Unsupported eval mode ${JSON.stringify(mode)}`);
}
const maxUsd = positiveNumber('max-usd');
const maxCalls = positiveInteger('max-calls');
const repeats = positiveInteger('repeats');
const judges = required('judges');
if (!['on', 'off'].includes(judges)) throw new Error('--judges must be on or off');

const fixtureDirectory = resolve('apps/dashboard/src/lib/agent/__evals__/fixtures');
const allFixtures = readdirSync(fixtureDirectory)
  .filter(file => file.endsWith('.json'))
  .sort()
  .map(file => JSON.parse(readFileSync(resolve(fixtureDirectory, file), 'utf8')));

const requestedIds = new Set(
  (args.get('fixtures') ?? '').split(',').map(value => value.trim()).filter(Boolean),
);
let fixtures;
if (mode === 'targeted') {
  if (requestedIds.size === 0) throw new Error('Targeted mode requires --fixtures');
  fixtures = allFixtures.filter(fixture => requestedIds.has(fixture.id));
  const found = new Set(fixtures.map(fixture => fixture.id));
  const missing = [...requestedIds].filter(id => !found.has(id));
  if (missing.length > 0) throw new Error(`Unknown fixture IDs: ${missing.join(', ')}`);
} else if (mode === 'release') {
  fixtures = allFixtures.filter(fixture => fixture.suite === 'core' && fixture.advisory !== true);
} else {
  fixtures = allFixtures;
}

const judgedFixtures = fixtures.filter(fixture => {
  const checks = fixture.expectedRubric?.checks ?? [];
  return judges === 'on' ? checks.length > 0 : checks.some(check => check.gate === true);
});

const prices = {
  'claude-sonnet-5': { input: 2, output: 10, cacheWrite: 4, cacheRead: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheWrite: 6, cacheRead: 0.3 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5, cacheWrite: 2, cacheRead: 0.1 },
};
const usageCost = (model, usage) => {
  const price = prices[model];
  if (!price) throw new Error(`No preflight price for ${model}`);
  return (
    usage.inputTokens * price.input
    + usage.outputTokens * price.output
    + usage.cacheCreationInputTokens * price.cacheWrite
    + usage.cacheReadInputTokens * price.cacheRead
  ) / 1_000_000;
};

const baseline = JSON.parse(readFileSync(resolve('apps/dashboard/src/lib/agent/__evals__/baseline.json'), 'utf8'));
const models = baseline.usage?.models ?? {};
const baselineRuns = baseline.usage?.runs ?? 0;
if (baselineRuns <= 0) throw new Error('Committed eval baseline has no usage evidence');
const judgedBaselineRuns = allFixtures.filter(fixture => (fixture.expectedRubric?.checks ?? []).length > 0).length
  * baseline.repeats;
const agentCostPerRun = Object.entries(models)
  .filter(([model]) => model !== 'claude-sonnet-4-6')
  .reduce((total, [model, usage]) => total + usageCost(model, usage), 0) / baselineRuns;
const judgeCostPerRun = judgedBaselineRuns > 0 && models['claude-sonnet-4-6']
  ? usageCost('claude-sonnet-4-6', models['claude-sonnet-4-6']) / judgedBaselineRuns
  : 0;

// The estimate is evidence-based and intentionally padded; maxUsd/maxCalls are
// the actual cutoffs. Confirmation retries are exceptional and consume only the
// remaining caller-approved headroom.
const dashboardEstimate = (
  fixtures.length * repeats * agentCostPerRun
  + judgedFixtures.length * repeats * judgeCostPerRun
) * 1.2;
const gatewayEstimate = mode === 'targeted' ? 0 : mode === 'release' ? 0.03 : 0.15;
const estimatedUsd = dashboardEstimate + gatewayEstimate;
const estimatedCalls = Math.ceil(fixtures.length * repeats * 1.75)
  + (mode === 'targeted' ? 0 : mode === 'release' ? 3 : 18);

if (estimatedUsd > maxUsd) {
  throw new Error(`Estimated $${estimatedUsd.toFixed(2)} exceeds the approved $${maxUsd.toFixed(2)} ceiling`);
}
if (estimatedCalls > maxCalls) {
  throw new Error(`Estimated ${estimatedCalls} calls exceeds the approved ${maxCalls}-call ceiling`);
}

const gatewayUsd = gatewayEstimate === 0 ? 0 : Math.max(gatewayEstimate * 1.5, maxUsd * 0.15);
const dashboardMaxUsd = maxUsd - gatewayUsd;
if (dashboardMaxUsd <= dashboardEstimate) {
  throw new Error(`Dashboard allocation $${dashboardMaxUsd.toFixed(2)} does not cover its $${dashboardEstimate.toFixed(2)} estimate`);
}
const gatewayMaxCalls = mode === 'targeted' ? 0 : mode === 'release' ? 6 : 24;
const dashboardMaxCalls = maxCalls - gatewayMaxCalls;
if (dashboardMaxCalls <= 0) throw new Error('Call ceiling leaves no dashboard allocation');

const output = {
  fixture_count: fixtures.length,
  judged_fixture_count: judgedFixtures.length,
  estimated_usd: estimatedUsd.toFixed(4),
  estimated_calls: String(estimatedCalls),
  dashboard_max_usd: dashboardMaxUsd.toFixed(4),
  dashboard_max_calls: String(dashboardMaxCalls),
  gateway_max_usd: gatewayUsd.toFixed(4),
  gateway_max_calls: String(gatewayMaxCalls),
};

console.log(
  `[eval:preflight] mode=${mode} fixtures=${fixtures.length} repeats=${repeats} judges=${judgedFixtures.length} `
  + `estimate=$${output.estimated_usd}/${maxUsd.toFixed(2)} calls=${estimatedCalls}/${maxCalls}`,
);
console.log(
  `[eval:preflight] allocations dashboard=$${output.dashboard_max_usd}/${output.dashboard_max_calls}calls `
  + `gateway=$${output.gateway_max_usd}/${output.gateway_max_calls}calls`,
);

const githubOutput = args.get('github-output');
if (githubOutput) {
  appendFileSync(githubOutput, `${Object.entries(output).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
}
