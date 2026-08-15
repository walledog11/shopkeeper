export type EmailInboundMode = 'hybrid' | 'postmark' | 'gmail-only';
export type GatewayRuntimeRole = 'all' | 'server' | 'worker';
export type RolloutMode = 'off' | 'shadow' | 'enforce';

export interface GatewayWorkerRedisProductionConfig {
  drainDelaySeconds: number;
  stalledIntervalMs: number;
  heartbeatIntervalMs: number;
  heartbeatTtlSecs: number;
  heartbeatStaleMs: number;
  queueDiagnosticsCacheMs: number;
  maintenanceWorkersEnabled: boolean;
}

export interface GatewayProductionConfig {
  dashboardUrl: string | undefined;
  dashboardInternalUrl: string | undefined;
  posthogHost: string | undefined;
  emailInboundMode: EmailInboundMode;
  runtimeRole: GatewayRuntimeRole;
  productAnalyticsEnabled: boolean;
  planExecutionLedgerMode: RolloutMode | undefined;
  agentContextBudgetMode: RolloutMode | undefined;
  gmailNativeInbound: boolean;
  workerRedis: GatewayWorkerRedisProductionConfig;
}

export const GATEWAY_PRODUCTION_CONFIG_SCHEMA: Readonly<Record<string, Readonly<{
  type: 'url' | 'boolean' | 'positiveInteger' | 'enum';
  values?: readonly string[];
  defaultValue?: string | boolean;
  normalize?: 'lowercase';
}>>>;

export function parseGatewayProductionConfig(
  env?: Readonly<Record<string, string | undefined>>,
): GatewayProductionConfig;

export function validateGatewayProductionConfig(
  env?: Readonly<Record<string, string | undefined>>,
): string[];
