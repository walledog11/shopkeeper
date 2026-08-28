import { GMAIL_MESSAGE_FETCH_CONCURRENCY } from './constants.js';

export async function mapGmailMessagesWithConcurrency<T>(
  items: string[],
  run: (messageId: string) => Promise<T>,
): Promise<T[]> {
  const results = new Array<T>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(GMAIL_MESSAGE_FETCH_CONCURRENCY, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await run(items[index]);
      }
    },
  );
  const settled = await Promise.allSettled(workers);
  const failure = settled.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) throw failure.reason;
  return results;
}
