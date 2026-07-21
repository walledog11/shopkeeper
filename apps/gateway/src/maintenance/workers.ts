import type { ConnectionOptions } from 'bullmq';
import { registerDigestMaintenanceJob } from './digest.js';
import { registerEmailTokenHealthMaintenanceJob } from './email-token-health.js';
import { registerGmailWatchMaintenanceJob } from './gmail-watch.js';
import { registerOperatorEventSweepMaintenanceJob } from './operator-event-sweep.js';
import { registerOrderRiskMaintenanceJob } from './order-risk-monitor.js';
import { registerReturnLifecycleMaintenanceJob } from './return-lifecycle-monitor.js';
import { registerDeliveryExceptionMaintenanceJob } from './delivery-exception-monitor.js';
import { registerOutboundSendSweepMaintenanceJob } from './outbound-send-sweep.js';
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
  registerGmailWatchMaintenanceJob,
  registerRetentionMaintenanceJobs,
  registerDigestMaintenanceJob,
  registerVoiceSynthesisMaintenanceJob,
  registerOrderRiskMaintenanceJob,
  registerReturnLifecycleMaintenanceJob,
  registerDeliveryExceptionMaintenanceJob,
  registerOutboundSendSweepMaintenanceJob,
  registerOperatorEventSweepMaintenanceJob,
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
