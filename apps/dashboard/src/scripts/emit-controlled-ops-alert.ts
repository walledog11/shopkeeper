import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import { getDashboardOpsAlertConfig } from '@/lib/env';
import { recordAgentFailure } from '@/lib/server/agent-failure-alerts';
import { recordProviderSendFailure } from '@/lib/server/provider-send-alerts';
import { getRedis } from '@/lib/server/redis';

loadDotenv({ path: resolve(process.cwd(), '.env.local') });
loadDotenv({ path: resolve(process.cwd(), '.env') });

const VALID_CATEGORIES = ['provider_send', 'agent_failure'] as const;
type ControlledCategory = typeof VALID_CATEGORIES[number];

function parseCategory(raw: string | undefined): ControlledCategory {
  const value = raw?.trim();
  if (!value || !VALID_CATEGORIES.includes(value as ControlledCategory)) {
    throw new Error(
      `Usage: npx tsx src/scripts/emit-controlled-ops-alert.ts <${VALID_CATEGORIES.join('|')}> [test-org-id]`,
    );
  }
  return value as ControlledCategory;
}

function parseOrgId(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) {
    throw new Error('[emit-controlled-ops-alert] test org id is required for provider_send');
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

async function main(): Promise<void> {
  const category = parseCategory(process.argv[2]);
  const orgId = parseOrgId(process.argv[3] ?? process.env.VERIFY_ALERT_ORG_ID);

  if (category === 'provider_send') {
    await emitProviderSendAlert(orgId);
    return;
  }

  await emitAgentFailureAlert(orgId);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
