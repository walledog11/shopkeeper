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

// The runtime the run pins, as EVAL_AGENT_RUNTIME_VERSION does. A fixture for
// one runtime's behavior only runs on that runtime (selectFixtures in the eval
// harness), so it only counts toward that runtime's budget.
const runtimeArg = args.get('runtime-version')?.trim() || 'current';
if (!['current', '1', '2'].includes(runtimeArg)) {
  throw new Error('--runtime-version must be current, 1 or 2');
}
const runtimeVersion = runtimeArg === 'current' ? undefined : Number(runtimeArg);

const fixtureDirectory = resolve('apps/dashboard/src/lib/agent/__evals__/fixtures');
const allFixtures = readdirSync(fixtureDirectory)
  .filter(file => file.endsWith('.json'))
  .sort()
  .map(file => JSON.parse(readFileSync(resolve(fixtureDirectory, file), 'utf8')))
  .filter(fixture => fixture.runtimeVersion === undefined || fixture.runtimeVersion === runtimeVersion);

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
  // Held-out fixtures run only with their whole suite (selectFixtures in the
  // eval harness); refuse here too, before any job starts.
  const heldOut = fixtures.filter(fixture => fixture.holdout).map(fixture => fixture.id);
  if (heldOut.length > 0) throw new Error(`Held-out fixtures cannot be targeted: ${heldOut.join(', ')}`);
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
const dashboardEstimate = mode === 'targeted'
  ? Math.max(baselineDashboardEstimate, TARGETED_COLD_START_USD_PER_REPEAT * repeats)
  : baselineDashboardEstimate;
// The gateway suite is the five `order-ops.eval.test.ts` fixtures at ~2 model
// calls each, and `drift`/`baseline` force `repeats=3`. Both gateway terms were
// once constants sized for a single repeat, so a baseline allocated 24 calls
// against a ~30-call need and died `24 / 24` after four of the five fixtures —
// run 33120836618, which had authorised 700. The dollar side already scaled off
// maxUsd; only the call side did not. Scale both off `repeats` so a mode that
// runs the suite three times reserves three times the calls.
const GATEWAY_FIXTURES = 5;
const GATEWAY_CALLS_PER_RUN = 2;
const gatewayCallEstimate = mode === 'targeted'
  ? 0
  : mode === 'release'
    ? 3
    : GATEWAY_FIXTURES * GATEWAY_CALLS_PER_RUN * repeats;
const gatewayEstimate = mode === 'targeted' ? 0 : mode === 'release' ? 0.03 : 0.05 * repeats;
const estimatedUsd = dashboardEstimate + gatewayEstimate;
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
const dashboardCallEstimate = mode === 'targeted'
  ? targetedCallEstimate
  : Math.ceil(fixtures.length * repeats * RELEASE_DASHBOARD_CALLS_PER_RUN);
const estimatedCalls = dashboardCallEstimate + gatewayCallEstimate;

if (estimatedUsd > maxUsd) {
  throw new Error(`Estimated $${estimatedUsd.toFixed(2)} exceeds the approved $${maxUsd.toFixed(2)} ceiling`);
}
if (estimatedCalls > maxCalls) {
  throw new Error(`Estimated ${estimatedCalls} calls exceeds the approved ${maxCalls}-call ceiling`);
}

// The release gateway is one hard case with at most one confirmation retry. A
// percentage of the total ceiling substantially over-reserved it and starved
// the 48-fixture dashboard job: run 32627931331 spent $0.0088 in the gateway
// while the dashboard crossed its $0.6375 sub-limit at $0.6633, still below the
// $0.75 total authorization. Keep $0.05 for the bounded gateway path and leave
// $0.70 for the larger release suite. Drift/baseline retain proportional room.
const gatewayUsd = gatewayEstimate === 0
  ? 0
  : mode === 'release'
    ? Math.max(gatewayEstimate * 1.5, 0.05)
    : Math.max(gatewayEstimate * 1.5, maxUsd * 0.15);
const dashboardMaxUsd = maxUsd - gatewayUsd;
if (dashboardMaxUsd <= dashboardEstimate) {
  throw new Error(`Dashboard allocation $${dashboardMaxUsd.toFixed(2)} does not cover its $${dashboardEstimate.toFixed(2)} estimate`);
}
const gatewayMaxCalls = mode === 'targeted'
  ? 0
  : mode === 'release'
    ? 6
    : Math.ceil(gatewayCallEstimate * 1.5);
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
