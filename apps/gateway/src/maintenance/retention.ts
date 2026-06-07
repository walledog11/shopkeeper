import { db } from '@shopkeeper/db';
import { JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  ONE_DAY_MS,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';
import {
  FILTERED_PURGE_AFTER_DAYS,
  purgeFilteredThreads,
} from './purge.js';

const ARCHIVE_AFTER_DAYS = 90;
const PURGE_AFTER_DAYS = 90;

export async function archiveOldClosedThreads(): Promise<void> {
  const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * ONE_DAY_MS);
  const result = await db.thread.updateMany({
    where: { status: 'closed', archivedAt: null, deletedAt: null, updatedAt: { lt: cutoff } },
    data: { archivedAt: new Date() },
  });
  logger.info({ count: result.count, cutoffDays: ARCHIVE_AFTER_DAYS }, '[Archival] Archived old closed threads');
}

export async function purgeDeletedRecords(): Promise<void> {
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * ONE_DAY_MS);

  const deletedMessages = await db.message.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  const deletedThreads = await db.thread.deleteMany({
    where: { deletedAt: { lt: cutoff }, messages: { none: {} } },
  });
  const deletedCustomers = await db.customer.deleteMany({
    where: { deletedAt: { lt: cutoff }, threads: { none: {} } },
  });

  logger.info(
    { messages: deletedMessages.count, threads: deletedThreads.count, customers: deletedCustomers.count, cutoffDays: PURGE_AFTER_DAYS },
    '[Purge] Hard-deleted expired soft-deleted records',
  );

  const filteredPurged = await purgeFilteredThreads(new Date());
  logger.info(
    { count: filteredPurged, cutoffDays: FILTERED_PURGE_AFTER_DAYS },
    '[Purge] Hard-deleted aged filtered threads',
  );
}

export const registerRetentionMaintenanceJobs: MaintenanceJobRegistration = async (context) => {
  const archivalQueue = createMaintenanceQueue(context, QUEUE.ARCHIVAL);
  await scheduleRepeatableJob(archivalQueue, JOB.ARCHIVE_THREADS, JOB.ARCHIVE_THREADS_ID, ONE_DAY_MS);

  const archivalWorker = createMaintenanceWorker(context, QUEUE.ARCHIVAL, archiveOldClosedThreads, {
    label: 'Archival',
    sentryQueue: 'thread-archival',
  });

  const purgeQueue = createMaintenanceQueue(context, QUEUE.PURGE);
  await scheduleRepeatableJob(purgeQueue, JOB.PURGE_DELETED, JOB.PURGE_DELETED_ID, ONE_DAY_MS);

  const purgeWorker = createMaintenanceWorker(context, QUEUE.PURGE, purgeDeletedRecords, {
    label: 'Purge',
    sentryQueue: 'purge',
  });

  return {
    workers: [archivalWorker, purgeWorker],
    queues: [archivalQueue, purgeQueue],
  };
};
