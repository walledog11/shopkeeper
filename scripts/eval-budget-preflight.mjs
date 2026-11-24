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
if (!['targeted', 'release'].includes(mode)) {
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
  // Prompts up to 100k tokens; baseline usage is aggregated, so the long-prompt tier can't apply.
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.2, cacheRead: 0.01 },
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

const budgetEvidence = JSON.parse(readFileSync(resolve('apps/dashboard/src/lib/agent/__evals__/eval-budget-evidence.json'), 'utf8'));
const models = budgetEvidence.usage?.models ?? {};
const baselineRuns = budgetEvidence.usageRuns ?? budgetEvidence.usage?.runs ?? 0;
if (baselineRuns <= 0) throw new Error('eval-budget-evidence.json has no usage evidence');
const judgedBaselineRuns = allFixtures.filter(fixture => (fixture.expectedRubric?.checks ?? []).length > 0).length
  * (budgetEvidence.repeats ?? 3);
const agentCostPerRun = Object.entries(models)
  .filter(([model]) => model !== 'claude-sonnet-4-6')
  .reduce((total, [model, usage]) => total + usageCost(model, usage), 0) / baselineRuns;
const judgeCostPerRun = judgedBaselineRuns > 0 && models['claude-sonnet-4-6']
  ? usageCost('claude-sonnet-4-6', models['claude-sonnet-4-6']) / judgedBaselineRuns
  : 0;

// The estimate is evidence-based and intentionally padded; maxUsd/maxCalls are
// the actual cutoffs. Targeted runs pay cold-cache cost on a much smaller sample,
// so the aggregate warm baseline needs more headroom there. The 2026-09-07
// three-fixture completion estimated $0.0380 with 1.2x padding but crossed its
// $0.05 ceiling at $0.0520. Two-times padding would have refused that ceiling.
// The subsequent isolated fixture cost $0.0460, above even its 2x-baseline
// estimate, so targeted work also carries that observed cold-start cost plus
// 20% contingency for every requested repeat.
const dashboardUsdContingency = mode === 'targeted' ? 2 : 1.2;
const baselineDashboardEstimate = (
  fixtures.length * repeats * agentCostPerRun
  + judgedFixtures.length * repeats * judgeCostPerRun
) * dashboardUsdContingency;
const TARGETED_COLD_START_USD_PER_REPEAT = 0.046 * 1.2;
const estimatedUsd = mode === 'targeted'
  ? Math.max(baselineDashboardEstimate, TARGETED_COLD_START_USD_PER_REPEAT * repeats)
  : baselineDashboardEstimate;
// Aggregate release/baseline runs can use observed average usage because dozens
// of fixtures share one ceiling. A small targeted run cannot: one planner may
// consume all 10 configured iterations, then retry once with the full registry.
// Reserve that mechanical 20-call planning bound per fixture. Fixtures that
// verify execution may then run a separate 10-iteration agent loop, and a
// rubric judge makes one additional call.
const AGENT_MAX_ITERATIONS = 10;
const RELEASE_DASHBOARD_CALLS_PER_RUN = 2.25;
const targetedCallEstimate = fixtures.reduce((total, fixture) => (
  total
  + AGENT_MAX_ITERATIONS * 2
  + (fixture.expectedPlan?.expectedAgentActions ? AGENT_MAX_ITERATIONS : 0)
  + (judgedFixtures.includes(fixture) ? 1 : 0)
), 0) * repeats;
const estimatedCalls = mode === 'targeted'
  ? targetedCallEstimate
  : Math.ceil(fixtures.length * repeats * RELEASE_DASHBOARD_CALLS_PER_RUN);

if (estimatedUsd > maxUsd) {
  throw new Error(`Estimated $${estimatedUsd.toFixed(2)} exceeds the approved $${maxUsd.toFixed(2)} ceiling`);
}
if (estimatedCalls > maxCalls) {
  throw new Error(`Estimated ${estimatedCalls} calls exceeds the approved ${maxCalls}-call ceiling`);
}

const output = {
  fixture_count: fixtures.length,
  judged_fixture_count: judgedFixtures.length,
  estimated_usd: estimatedUsd.toFixed(4),
  estimated_calls: String(estimatedCalls),
  dashboard_max_usd: maxUsd.toFixed(4),
  dashboard_max_calls: String(maxCalls),
};

console.log(
  `[eval:preflight] mode=${mode} fixtures=${fixtures.length} repeats=${repeats} judges=${judgedFixtures.length} `
  + `estimate=$${output.estimated_usd}/${maxUsd.toFixed(2)} calls=${estimatedCalls}/${maxCalls}`,
);

const githubOutput = args.get('github-output');
if (githubOutput) {
  appendFileSync(githubOutput, `${Object.entries(output).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
}
