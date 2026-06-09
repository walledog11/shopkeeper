import { getGatewayRedis } from './clients/redis-client.js';
import type { OpsAlertCounterClient } from './ops-alerts.js';

let counterClient: OpsAlertCounterClient | null = null;

export function getOpsAlertCounterClient(): OpsAlertCounterClient {
  if (!counterClient) {
    counterClient = getGatewayRedis();
  }
  return counterClient;
}
