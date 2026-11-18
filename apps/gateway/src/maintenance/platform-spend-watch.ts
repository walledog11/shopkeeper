import {
  getPlatformDailyLlmSpendNano,
  nanoDollarsToUsd,
  platformDailyLlmSpendStopUsd,
} from '@shopkeeper/db';
import { emitOpsAlert } from '../ops-alerts.js';
import {
  FIVE_MINUTES_MS,
  createMaintenanceQueue,
  createMaintenanceWorker,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

const QUEUE_NAME = 'platform-spend-watch';
const WARN_AT_RATIO = 0.8;

// The platform-wide stop pauses AI work in every workspace until midnight UTC,
// and otherwise only merchants would notice. The ops chat hears at 80%, in time
// to raise PLATFORM_DAILY_LLM_SPEND_STOP_USD, and again when the stop trips:
// each at most once a day.
async function checkPlatformSpend(): Promise<void> {
  const stopUsd = platformDailyLlmSpendStopUsd();
  const spentUsd = nanoDollarsToUsd(await getPlatformDailyLlmSpendNano());
  const stopped = spentUsd >= stopUsd;
  if (!stopped && spentUsd < stopUsd * WARN_AT_RATIO) return;

  const spend = `$${spentUsd.toFixed(2)} of $${stopUsd}`;
  emitOpsAlert({
    category: 'usage_limit',
    level: stopped ? 'error' : 'warning',
    message: stopped
      ? `Platform AI spend reached the daily stop (${spend}); AI work is paused in every workspace until midnight UTC`
      : `Platform AI spend is at ${Math.floor((spentUsd / stopUsd) * 100)}% of the daily stop (${spend})`,
    fingerprint: ['ops-alert', 'usage_limit', 'gateway', `source:platform_llm_spend_${stopped ? 'stopped' : 'warning'}`],
    extra: { spentUsd, stopUsd },
  }, { pushOncePerSecs: 24 * 60 * 60 });
}

export const registerPlatformSpendWatchMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE_NAME);
  await scheduleRepeatableJob(queue, 'check-platform-spend', 'platform-spend-watch-5min', FIVE_MINUTES_MS);
  const worker = createMaintenanceWorker(context, QUEUE_NAME, checkPlatformSpend, {
    label: 'PlatformSpendWatch',
    failureQueue: QUEUE_NAME,
  });
  return { workers: [worker], queues: [queue] };
};
