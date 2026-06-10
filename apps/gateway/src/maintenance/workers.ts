import type { ConnectionOptions } from 'bullmq';
import { registerDigestMaintenanceJob } from './digest.js';
import { registerEmailTokenHealthMaintenanceJob } from './email-token-health.js';
import { registerOrderRiskMaintenanceJob } from './order-risk-monitor.js';
import { registerOutboundEmailSweepMaintenanceJob } from './outbound-email-sweep.js';
import { registerQueueHealthMaintenanceJob } from './queue-health.js';
import { registerRetentionMaintenanceJobs } from './retention.js';
import {
  buildMaintenanceResources,
  closeMaintenanceQueues,
  closeMaintenanceWorkers,
  type MaintenanceJobRegistration,
  type ProducerConnection,
  type SharedWorkerOptions,
} from './registration.js';
import { registerTokenHealthMaintenanceJob } from './token-health.js';
import { registerVoiceSynthesisMaintenanceJob } from './voice-synthesis.js';

export const maintenanceJobRegistrations: MaintenanceJobRegistration[] = [
  registerTokenHealthMaintenanceJob,
  registerEmailTokenHealthMaintenanceJob,
  registerRetentionMaintenanceJobs,
  registerDigestMaintenanceJob,
  registerVoiceSynthesisMaintenanceJob,
  registerOrderRiskMaintenanceJob,
  registerOutboundEmailSweepMaintenanceJob,
  registerQueueHealthMaintenanceJob,
];

export async function createMaintenanceWorkers(
  workerConn: ConnectionOptions,
  producerConn: ProducerConnection,
  workerOptions: SharedWorkerOptions,
) {
  return buildMaintenanceResources(maintenanceJobRegistrations, {
    workerConn,
    producerConn,
    workerOptions,
  });
}

export {
  closeMaintenanceQueues,
  closeMaintenanceWorkers,
};

export type {
  MaintenanceResources,
  ProducerConnection,
  SharedWorkerOptions,
} from './registration.js';
