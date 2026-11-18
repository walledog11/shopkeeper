import type { OpsAlertCategory } from '@shopkeeper/agent/observability';
import logger from '../logger.js';
import { emitOpsAlert } from '../ops-alerts.js';
import { captureJobFailure } from '../sentry.js';

interface FailedJobSnapshot<DataType> {
  id?: string;
  attemptsMade?: number;
  /** Set only when BullMQ will not retry the job. */
  finishedOn?: number;
  data?: DataType;
}

export interface WorkerFailureEmitter<DataType> {
  /** The queue name. */
  readonly name: string;
  on(
    event: 'failed',
    listener: (job: FailedJobSnapshot<DataType> | undefined, err: Error) => void,
  ): unknown;
}

export interface JobFailureLoggingOptions<DataType> {
  logMessage: string;
  logFields: (job: FailedJobSnapshot<DataType> | undefined, err: Error) => Record<string, unknown>;
  failureExtra: (job: FailedJobSnapshot<DataType> | undefined, err: Error) => Record<string, unknown>;
  /** A failure someone has to act on: it goes to the ops chat, once an hour per queue. */
  alert?: { category: OpsAlertCategory; queue: string };
}

export function registerJobFailureLogging<DataType>(
  worker: WorkerFailureEmitter<DataType>,
  options: JobFailureLoggingOptions<DataType>,
): void {
  worker.on('failed', (job, err) => {
    const extra = options.failureExtra(job, err);
    const fields = { err: err.message, ...options.logFields(job, err), ...extra };
    // An attempt BullMQ will retry has lost nothing yet; the last one has.
    if (job?.finishedOn !== undefined) captureJobFailure(worker.name, err, extra);
    if (!options.alert) {
      logger.error(fields, options.logMessage);
      return;
    }
    emitOpsAlert({
      category: options.alert.category,
      level: 'error',
      message: options.logMessage,
      tags: { queue: options.alert.queue },
      fingerprint: ['ops-alert', options.alert.category, 'gateway', `source:${options.alert.queue}_job_failed`],
      extra: fields,
    }, { pushOncePerSecs: 60 * 60 });
  });
}
