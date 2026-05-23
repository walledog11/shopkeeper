import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { OutboundRecord, OutboundRecordInput } from './outbound-recorder';

export async function recordOutboundCallToFile(
  input: OutboundRecordInput,
  recordPath: string,
): Promise<OutboundRecord> {
  const record: OutboundRecord = {
    id: randomUUID(),
    recordedAt: new Date().toISOString(),
    ...input,
  };

  await mkdir(path.dirname(recordPath), { recursive: true });
  await appendFile(recordPath, `${JSON.stringify(record)}\n`, 'utf8');

  return record;
}

export async function readOutboundRecordsFromFile(recordPath: string): Promise<OutboundRecord[]> {
  const content = await readFile(recordPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });

  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OutboundRecord);
}

export async function clearOutboundRecordsFile(recordPath: string): Promise<void> {
  await rm(recordPath, { force: true });
}
