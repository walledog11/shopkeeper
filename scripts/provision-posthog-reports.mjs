// product-instrumentation Phase 4: provision the four merchant-activation
// PostHog reports (activation funnel, time to value, agent quality, weekly
// retention) plus the "Meaningful activity" retention Action, grouped onto one
// dashboard. Definitions mirror docs/production/posthog-reports.md and the real
// event wire schema in packages/analytics/src.
//
// Idempotent: reuses any existing Action/dashboard/insight with the same name
// instead of creating a duplicate. Safe to re-run (e.g. after enabling staging,
// then production).
//
//   POSTHOG_PERSONAL_API_KEY=phx_... POSTHOG_PROJECT_ID=12345 \
//     npm run provision:posthog-reports
//   npm run provision:posthog-reports -- --dry-run
//   POSTHOG_ENVIRONMENT=staging npm run provision:posthog-reports
//
// Required env:
//   POSTHOG_PERSONAL_API_KEY  personal API key with insight/dashboard/action
//                             write scopes and access to the target project
//   POSTHOG_PROJECT_ID        numeric PostHog project id
// Optional env:
//   POSTHOG_API_HOST          management API host (default https://us.posthog.com;
//                             this is NOT the https://us.i.posthog.com ingest host)
//   POSTHOG_ENVIRONMENT       environment property filter (default production)
//   POSTHOG_DASHBOARD_NAME    dashboard name (default "Merchant Activation")

const DRY_RUN = process.argv.slice(2).includes('--dry-run');

const API_HOST = (process.env.POSTHOG_API_HOST ?? 'https://us.posthog.com').replace(/\/$/, '');
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const ENVIRONMENT = process.env.POSTHOG_ENVIRONMENT ?? 'production';
const DASHBOARD_NAME = process.env.POSTHOG_DASHBOARD_NAME ?? 'Merchant Activation';
const TAG = 'merchant-activation';
const ACTION_NAME = 'Meaningful activity';

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

if (typeof fetch !== 'function') fail('global fetch is unavailable; use Node 18+.');
if (!DRY_RUN && !API_KEY) fail('POSTHOG_PERSONAL_API_KEY is required.');
if (!DRY_RUN && !PROJECT_ID) fail('POSTHOG_PROJECT_ID is required.');

// --- query building blocks -------------------------------------------------

// Every event carries an `environment` property; scope all reports to one env.
const envFilter = { key: 'environment', type: 'event', operator: 'exact', value: [ENVIRONMENT] };
const eq = (key, ...values) => ({ key, type: 'event', operator: 'exact', value: values });

const funnelStep = (event, properties) => ({
  kind: 'EventsNode',
  event,
  name: event,
  ...(properties ? { properties } : {}),
});

const trend = (event, breakdown, seriesProps) => ({
  kind: 'InsightVizNode',
  source: {
    kind: 'TrendsQuery',
    series: [
      { kind: 'EventsNode', event, name: event, math: 'total', ...(seriesProps ? { properties: seriesProps } : {}) },
    ],
    breakdownFilter: { breakdown, breakdown_type: 'event' },
    dateRange: { date_from: '-30d' },
    properties: [envFilter],
  },
});

function buildInsights(actionId) {
  return [
    {
      name: 'Activation funnel',
      description: 'Seven-day ordered activation funnel, last 90 days.',
      query: {
        kind: 'InsightVizNode',
        source: {
          kind: 'FunnelsQuery',
          series: [
            funnelStep('workspace_created'),
            funnelStep('integration_connection_completed', [eq('platform', 'shopify')]),
            funnelStep('integration_connection_completed', [eq('platform', 'email')]),
            funnelStep('onboarding_completed'),
            funnelStep('inbound_message_processed'),
            funnelStep('agent_plan_decided', [eq('decision', 'approved')]),
            funnelStep('outbound_reply_sent', [eq('reply_source', 'agent_approved', 'agent_automatic')]),
          ],
          funnelsFilter: {
            funnelWindowInterval: 7,
            funnelWindowIntervalUnit: 'day',
            funnelOrderType: 'ordered',
          },
          dateRange: { date_from: '-90d' },
          properties: [envFilter],
        },
      },
    },
    {
      name: 'Time to value',
      description: 'Median and p90 seconds from workspace_created to workspace_activated.',
      query: {
        kind: 'InsightVizNode',
        source: {
          kind: 'TrendsQuery',
          series: [
            {
              kind: 'EventsNode',
              event: 'workspace_activated',
              name: 'median seconds to activation',
              math: 'median',
              math_property: 'seconds_since_workspace_created',
            },
            {
              kind: 'EventsNode',
              event: 'workspace_activated',
              name: 'p90 seconds to activation',
              math: 'p90',
              math_property: 'seconds_since_workspace_created',
            },
          ],
          breakdownFilter: { breakdown: 'within_seven_days', breakdown_type: 'event' },
          dateRange: { date_from: '-90d' },
          properties: [envFilter],
        },
      },
    },
    {
      name: 'Agent quality — plan decisions',
      description: 'Approval / dismissal / regeneration rate.',
      query: trend('agent_plan_decided', 'decision'),
    },
    {
      name: 'Agent quality — changed vs unchanged approvals',
      description: 'Approved plans, split by whether the merchant edited them.',
      query: trend('agent_plan_decided', 'changed', [eq('decision', 'approved')]),
    },
    {
      name: 'Agent quality — action outcomes',
      description: 'Tool action success / block / failure / unknown.',
      query: trend('agent_action_completed', 'outcome'),
    },
    {
      name: 'Agent quality — manual vs agent replies',
      description: 'Outbound replies by source.',
      query: trend('outbound_reply_sent', 'reply_source'),
    },
    {
      name: 'Agent quality — cache-hit vs generated plans',
      description: 'Plan generation split by cache hit.',
      query: trend('agent_plan_generated', 'cache_hit'),
    },
    {
      name: 'Weekly retention',
      description: 'Weekly first-time retention: workspace_created returning to meaningful activity.',
      query: {
        kind: 'InsightVizNode',
        source: {
          kind: 'RetentionQuery',
          retentionFilter: {
            period: 'Week',
            totalIntervals: 8,
            targetEntity: { id: 'workspace_created', name: 'workspace_created', type: 'events' },
            returningEntity: { id: actionId, name: ACTION_NAME, type: 'actions' },
            retentionType: 'retention_first_time',
          },
          properties: [envFilter],
        },
      },
    },
  ];
}

// --- PostHog management API -------------------------------------------------

function apiUrl(path) {
  return `${API_HOST}/api/projects/${PROJECT_ID}${path}`;
}

async function phFetch(method, path, body) {
  const res = await fetch(apiUrl(path), {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}\n${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function findByName(collection, name) {
  const data = await phFetch('GET', `/${collection}/?limit=200&search=${encodeURIComponent(name)}`);
  return (data.results ?? []).find((row) => row.name === name) ?? null;
}

async function ensure(collection, name, createBody, label) {
  const existing = await findByName(collection, name);
  if (existing) {
    console.log(`  reused ${label}: ${name} (id ${existing.id})`);
    return existing;
  }
  const created = await phFetch('POST', `/${collection}/`, createBody);
  console.log(`  created ${label}: ${name} (id ${created.id})`);
  return created;
}

function webUrl(kind, row) {
  const id = kind === 'insight' ? row.short_id : row.id;
  return `${API_HOST}/project/${PROJECT_ID}/${kind}/${id}`;
}

// --- run -------------------------------------------------------------------

async function run() {
  if (DRY_RUN) {
    console.log(`Dry run — environment=${ENVIRONMENT}, dashboard="${DASHBOARD_NAME}". No API calls.\n`);
    console.log(`Action "${ACTION_NAME}": agent_plan_decided | agent_action_completed | outbound_reply_sent\n`);
    for (const insight of buildInsights('<ACTION_ID>')) {
      console.log(`# ${insight.name}`);
      console.log(JSON.stringify(insight.query, null, 2));
      console.log();
    }
    return;
  }

  console.log(`Provisioning into project ${PROJECT_ID} @ ${API_HOST} (environment=${ENVIRONMENT})`);

  const action = await ensure(
    'actions',
    ACTION_NAME,
    {
      name: ACTION_NAME,
      description: 'Any meaningful merchant activity for weekly retention.',
      tags: [TAG],
      steps: [
        { event: 'agent_plan_decided' },
        { event: 'agent_action_completed' },
        { event: 'outbound_reply_sent' },
      ],
    },
    'action',
  );

  const dashboard = await ensure(
    'dashboards',
    DASHBOARD_NAME,
    { name: DASHBOARD_NAME, description: 'Merchant activation, time-to-value, agent quality, retention.', tags: [TAG] },
    'dashboard',
  );

  const results = [];
  for (const insight of buildInsights(action.id)) {
    const row = await ensure(
      'insights',
      insight.name,
      { name: insight.name, description: insight.description, query: insight.query, tags: [TAG], dashboards: [dashboard.id] },
      'insight',
    );
    results.push({ name: insight.name, url: webUrl('insight', row) });
  }

  console.log('\nDone. Fill these into docs/production/posthog-reports.md:');
  console.log(`  Dashboard "${DASHBOARD_NAME}": ${webUrl('dashboard', dashboard)}`);
  for (const r of results) console.log(`  ${r.name}: ${r.url}`);
}

run().catch((error) => fail(error.message));
