#!/usr/bin/env node
// Backfill Thread.subject for old email tickets and (re)generate cachedPlan
// for open genuine threads whose plan is missing or stale.
//
// Usage:
//   node scripts/backfill-thread-subject-and-plan.mjs            # apply both
//   node scripts/backfill-thread-subject-and-plan.mjs --dry-run  # report only
//   node scripts/backfill-thread-subject-and-plan.mjs --subject-only
//   node scripts/backfill-thread-subject-and-plan.mjs --plan-only

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE_PATHS = [
  path.join(REPO_ROOT, '.env'),
  path.join(REPO_ROOT, '.env.local'),
  path.join(REPO_ROOT, 'apps/dashboard/.env'),
  path.join(REPO_ROOT, 'apps/dashboard/.env.local'),
  path.join(REPO_ROOT, 'apps/gateway/.env'),
  path.join(REPO_ROOT, 'apps/gateway/.env.local'),
];
for (const envPath of ENV_FILE_PATHS) {
  try {
    const parsed = dotenv.parse(readFileSync(envPath));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
}

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const SUBJECT_ONLY = args.has('--subject-only');
const PLAN_ONLY = args.has('--plan-only');
const SUBJECT_MAX_LEN = 200;

const { db } = await import('@shopkeeper/db');

function deriveSubject(text) {
  if (!text) return null;
  const firstLine = text.split('\n').map(l => l.trim()).find(Boolean);
  if (!firstLine) return null;
  return firstLine.length > SUBJECT_MAX_LEN
    ? `${firstLine.slice(0, SUBJECT_MAX_LEN - 1).trimEnd()}…`
    : firstLine;
}

async function backfillSubjects() {
  const threads = await db.thread.findMany({
    where: {
      channelType: 'email',
      subject: null,
      deletedAt: null,
    },
    select: {
      id: true,
      messages: {
        where: { senderType: 'customer', deletedAt: null },
        orderBy: { sentAt: 'asc' },
        take: 1,
        select: { contentText: true },
      },
    },
  });

  let updated = 0;
  let skippedNoMessage = 0;
  for (const thread of threads) {
    const first = thread.messages[0];
    const subject = deriveSubject(first?.contentText ?? null);
    if (!subject) {
      skippedNoMessage += 1;
      continue;
    }
    if (DRY_RUN) {
      console.log(`[subject:dry] ${thread.id} → "${subject}"`);
    } else {
      await db.thread.update({ where: { id: thread.id }, data: { subject } });
    }
    updated += 1;
  }

  console.log(
    `[subject] candidates=${threads.length} ${DRY_RUN ? 'would_update' : 'updated'}=${updated} skipped_no_message=${skippedNoMessage}`,
  );
}

async function backfillPlans() {
  const tsxArgs = ['tsx', 'apps/gateway/src/scripts/backfill-plans.ts', '--genuine-only'];
  if (DRY_RUN) tsxArgs.push('--dry-run');

  const result = spawnSync('npx', tsxArgs, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`plan backfill exited with code ${result.status ?? 'unknown'}`);
  }
}

async function main() {
  console.log(`[backfill] mode=${DRY_RUN ? 'dry-run' : 'apply'}${SUBJECT_ONLY ? ' subject-only' : ''}${PLAN_ONLY ? ' plan-only' : ''}`);
  if (!PLAN_ONLY) await backfillSubjects();
  if (!SUBJECT_ONLY) await backfillPlans();
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error('[backfill] fatal', err);
  try {
    await db.$disconnect();
  } catch (disconnectErr) {
    console.error('[backfill] disconnect after fatal failed', disconnectErr);
  }
  process.exit(1);
});
