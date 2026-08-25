import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { getDashboardOpsAlertConfig } from '../../apps/dashboard/src/lib/env/index.ts';
import { recordAgentFailure } from '../../apps/dashboard/src/lib/server/agent-failure-alerts.ts';
import { recordProviderSendFailure } from '../../apps/dashboard/src/lib/server/provider-send-alerts.ts';
import { getRedis } from '../../apps/dashboard/src/lib/server/redis.ts';

loadDotenv({ path: resolve(process.cwd(), '.env.local') });
loadDotenv({ path: resolve(process.cwd(), '.env') });

const VALID_CATEGORIES = ['provider_send', 'agent_failure'] as const;
type ControlledCategory = typeof VALID_CATEGORIES[number];

function parseCategory(raw: string | undefined): ControlledCategory {
  const value = raw?.trim();
  if (!value || !VALID_CATEGORIES.includes(value as ControlledCategory)) {
    throw new Error(
      `Usage: npx tsx scripts/emit-controlled-ops-alert.ts --app=dashboard <${VALID_CATEGORIES.join('|')}> [test-org-id]`,
    );
  }
  return value as ControlledCategory;
}

function parseOrgId(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) {
    throw new Error('[emit-controlled-ops-alert] test org id is required for provider_send and agent_failure');
  }
  return value;
}

function validationConfig() {
  const base = getDashboardOpsAlertConfig();
  return {
    ...base,
    enabled: true,
    windowSecs: 60,
    providerSendThreshold: 1,
    agentFailureThreshold: 1,
  };
}

async function emitProviderSendAlert(orgId: string): Promise<void> {
  const config = validationConfig();
  const result = await recordProviderSendFailure('postmark', 'email', orgId, {
    counterClient: getRedis(),
    config,
    detail: 'controlled-validation',
    extra: { validation: true },
  });

  console.log(JSON.stringify({ category: 'provider_send', emitted: result.emitted, window: result.window }, null, 2));
}

async function emitAgentFailureAlert(orgId: string): Promise<void> {
  const config = validationConfig();
  const result = await recordAgentFailure({
    kind: 'route_failure',
    route: '/api/agent',
    orgId,
    statusCode: 400,
    detail: 'controlled-validation',
  }, {
    counterClient: getRedis(),
    config,
  });

  console.log(JSON.stringify({ category: 'agent_failure', emitted: result.emitted, window: result.window }, null, 2));
}

export async function runDashboardEmitControlledOpsAlert(argv: string[]): Promise<void> {
  const category = parseCategory(argv[0]);
  const orgId = parseOrgId(argv[1] ?? process.env.VERIFY_ALERT_ORG_ID);

  if (category === 'provider_send') {
    await emitProviderSendAlert(orgId);
    return;
  }

  await emitAgentFailureAlert(orgId);
}
