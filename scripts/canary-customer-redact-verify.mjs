#!/usr/bin/env node
// `customers/redact` canary — verify half (READ-ONLY).
//
// Reads the state written by canary-customer-redact-seed.mjs and reports, row
// by row, whether the delivery actually erased the fixture.
//
// The assertion that matters is not the webhook's 200. A 200 with every fixture
// row still present is precisely what the pre-20260830230000 bug looked like:
// the transaction aborted on 23502 and the handler reported success.
//
//   node scripts/canary-customer-redact-verify.mjs --state=redact-canary.json
//   SHOPKEEPER_DB_TARGET=prod node scripts/canary-customer-redact-verify.mjs --state=redact-canary.json
import { readFileSync } from 'node:fs';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

function stringArg(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const statePath = stringArg('state');
if (!statePath) {
  console.error('--state=<path> is required (the JSON written by the seed half).');
  process.exit(1);
}
const state = JSON.parse(readFileSync(statePath, 'utf8'));

const { db } = await import('@shopkeeper/db');

async function blobSurvives(pathname) {
  if (!pathname) return null;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const { head } = await import('@vercel/blob');
  try {
    await head(pathname);
    return true;
  } catch {
    return false;
  }
}

try {
  const [customer, thread, messages, outcome, action] = await Promise.all([
    db.customer.findUnique({ where: { id: state.customerId }, select: { id: true } }),
    db.thread.findUnique({ where: { id: state.threadId }, select: { id: true } }),
    db.message.findMany({ where: { id: { in: state.messageIds } }, select: { id: true } }),
    db.requestEpisodeOutcome.findUnique({ where: { id: state.outcomeId }, select: { id: true } }),
    db.agentAction.findUnique({ where: { id: state.agentActionId }, select: { id: true } }),
  ]);
  const blob = await blobSurvives(state.blobPathname);

  const checks = [
    { row: 'customer', survives: customer !== null },
    { row: 'thread', survives: thread !== null },
    { row: `messages (${messages.length}/${state.messageIds.length} left)`, survives: messages.length > 0 },
    { row: 'request_episode_outcome', survives: outcome !== null },
    { row: 'agent_action', survives: action !== null },
    ...(blob === null
      ? []
      : [{ row: `blob ${state.blobPathname}`, survives: blob }]),
  ];

  const survivors = checks.filter((check) => check.survives);
  for (const check of checks) {
    console.log(`${check.survives ? 'FAIL  present' : 'ok    erased'}  ${check.row}`);
  }
  if (blob === null && state.blobPathname) {
    console.log('skip  blob — BLOB_READ_WRITE_TOKEN unset, could not check');
  }
  if (blob === null && !state.blobPathname) {
    console.log('skip  blob — fixture was seeded without an attachment');
  }

  console.log('');
  if (survivors.length === 0) {
    console.log('PASS — the redaction erased every seeded row.');
    console.log('Confirm the gateway logged non-zero deletedCustomers/deletedThreads/deletedMessages');
    console.log('on "[Webhook] Shopify customer data redacted"; that is the other half of the evidence.');
  } else if (survivors.length === checks.length) {
    console.log('FAIL — nothing was erased.');
    console.log('Either the delivery never reached the handler (check the HMAC and the 200),');
    console.log('or the transaction aborted and still reported success — the original bug.');
  } else {
    console.log(`FAIL — partial erasure, ${survivors.length}/${checks.length} rows survived.`);
    console.log('A partial delete means the transaction did not cover this class. Report which.');
  }
  process.exitCode = survivors.length === 0 ? 0 : 1;
} finally {
  await db.$disconnect();
}
