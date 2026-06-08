import { Queue, Worker, type ConnectionOptions, type Processor, type QueueOptions, type WorkerOptions } from 'bullmq';
import type { OpsAlertCounterClient } from '../ops-alerts.js';
import { registerJobFailureLogging } from '../workers/failure.js';

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const ONE_HOUR_MS = 60 * 60 * 1000;
export const FIVE_MINUTES_MS = 5 * 60 * 1000;

export type SharedWorkerOptions = Pick<WorkerOptions, 'drainDelay' | 'stalledInterval'>;
export type ProducerConnection = ConnectionOptions & OpsAlertCounterClient;

export interface MaintenanceRegistrationContext {
  workerConn: ConnectionOptions;
  producerConn: ProducerConnection;
  workerOptions: SharedWorkerOptions;
}

export interface MaintenanceResources {
  workers: Worker[];
  queues: Queue[];
}

export type MaintenanceJobRegistration = (
  context: MaintenanceRegistrationContext,
) => Promise<MaintenanceResources>;

export function emptyMaintenanceResources(): MaintenanceResources {
  return { workers: [], queues: [] };
}

export function createMaintenanceQueue<DataType = unknown>(
  context: MaintenanceRegistrationContext,
  queueName: string,
  options: Omit<QueueOptions, 'connection'> = {},
): Queue<DataType> {
  return new Queue<DataType>(queueName, {
    ...options,
    connection: context.producerConn,
  });
}

export function createMaintenanceWorker<DataType = unknown>(
  context: MaintenanceRegistrationContext,
  queueName: string,
  processor: Processor<DataType>,
  failure: { label: string; failureQueue: string },
): Worker<DataType> {
  const worker = new Worker<DataType>(queueName, processor, {
    connection: context.workerConn,
    ...context.workerOptions,
  });
  registerWorkerFailure(worker, failure.label, failure.failureQueue);
  return worker;
}

export async function scheduleRepeatableJob(
  queue: Queue,
  name: string,
  jobId: string,
  everyMs: number,
): Promise<void> {
  await queue.add(name, {}, { repeat: { every: everyMs }, jobId });
}

export async function buildMaintenanceResources(
  registrations: MaintenanceJobRegistration[],
  context: MaintenanceRegistrationContext,
): Promise<MaintenanceResources> {
  const resources = emptyMaintenanceResources();

  for (const register of registrations) {
    const registered = await register(context);
    resources.workers.push(...registered.workers);
    resources.queues.push(...registered.queues);
  }

  return resources;
}

export async function closeMaintenanceWorkers(resources: MaintenanceResources): Promise<void> {
  await Promise.all(resources.workers.map((worker) => worker.close()));
}

export async function closeMaintenanceQueues(resources: MaintenanceResources): Promise<void> {
  await Promise.all(resources.queues.map((queue) => queue.close()));
}

function registerWorkerFailure(worker: Worker, label: string, failureQueue: string): void {
  registerJobFailureLogging(worker, {
    logMessage: `[${label}] Job failed`,
    logFields: (job) => ({ jobId: job?.id }),
    failureExtra: (job) => ({
      jobId: job?.id,
      queue: failureQueue,
      attemptsMade: job?.attemptsMade,
    }),
  });
}
