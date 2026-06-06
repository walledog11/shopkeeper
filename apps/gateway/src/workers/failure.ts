import * as Sentry from '@sentry/node';
import logger from '../logger.js';

export interface FailedJobSnapshot<DataType> {
  id?: string;
  attemptsMade?: number;
  data?: DataType;
}

export interface WorkerFailureEmitter<DataType> {
  on(
    event: 'failed',
    listener: (job: FailedJobSnapshot<DataType> | undefined, err: Error) => void,
  ): unknown;
}

export interface JobFailureLoggingOptions<DataType> {
  logMessage: string;
  logFields: (job: FailedJobSnapshot<DataType> | undefined, err: Error) => Record<string, unknown>;
  sentryExtra: (job: FailedJobSnapshot<DataType> | undefined, err: Error) => Record<string, unknown>;
}

export function registerJobFailureLogging<DataType>(
  worker: WorkerFailureEmitter<DataType>,
  options: JobFailureLoggingOptions<DataType>,
): void {
  worker.on('failed', (job, err) => {
    logger.error(
      { err: err.message, ...options.logFields(job, err) },
      options.logMessage,
    );
    Sentry.captureException(err, {
      extra: options.sentryExtra(job, err),
    });
  });
}
