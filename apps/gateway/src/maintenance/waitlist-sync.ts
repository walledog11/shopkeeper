import { db } from '@shopkeeper/db';
import { processWaitlistSync } from '@shopkeeper/email/waitlist';
import logger from '../logger.js';
import { createMaintenanceQueue, createMaintenanceWorker, scheduleRepeatableJob, type MaintenanceJobRegistration } from './registration.js';

export const registerWaitlistSyncMaintenanceJob: MaintenanceJobRegistration = async context => {
  if (process.env.LOOPS_WAITLIST_ENABLED !== 'true') return { workers: [], queues: [] };
  const queueName = 'waitlist-sync';
  const queue = createMaintenanceQueue(context, queueName);
  await scheduleRepeatableJob(queue, 'sync-waitlist', 'waitlist-sync-1min', 60_000);
  const worker = createMaintenanceWorker(context, queueName, async () => {
    const result = await processWaitlistSync();
    if (result.failed) logger.warn({ event: 'waitlist_sync_retry', failed: result.failed }, 'Waitlist sync needs retry');
    await db.waitlistWebhookReceipt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60_000) } } });
  }, { label: 'WaitlistSync', failureQueue: queueName });
  return { workers: [worker], queues: [queue] };
};
