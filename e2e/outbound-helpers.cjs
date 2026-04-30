const { readFile } = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_POLL_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 250;

function getOutboundRecordPath() {
  return process.env.E2E_OUTBOUND_RECORD_PATH || path.join(process.cwd(), 'test-results', 'e2e-outbound.jsonl');
}

async function readOutboundRecords() {
  const recordPath = getOutboundRecordPath();
  const content = await readFile(recordPath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });

  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function waitForOutboundRecord(
  predicate,
  { timeoutMs = DEFAULT_POLL_TIMEOUT_MS, intervalMs = DEFAULT_POLL_INTERVAL_MS } = {},
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const records = await readOutboundRecords();
    const record = records.find(predicate);

    if (record) {
      return record;
    }

    await sleep(intervalMs);
  }

  throw new Error(`No matching outbound record appeared within ${timeoutMs}ms`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  getOutboundRecordPath,
  readOutboundRecords,
  waitForOutboundRecord,
};
