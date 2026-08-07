#!/usr/bin/env node
// Remove stale integration rows when multiple workspaces share one external
// account id (common after reconnect/testing). Keeps the newest integration —
// the same row resolveOrganizationId now prefers for inbound webhooks.
//
// Dry run by default. Pass --execute to delete the stale rows.
//
//   npm run cleanup:duplicate-integrations
//   npm run cleanup:duplicate-integrations -- --platform=shopify
//   npm run cleanup:duplicate-integrations -- --external-account-id=palette-dev-3peukw16.myshopify.com
//   npm run cleanup:duplicate-integrations -- --execute --external-account-id=palette-dev-3peukw16.myshopify.com
import { loadLocalEnv } from './load-local-env.mjs';
import {
  groupKey,
  planDuplicateIntegrationCleanup,
} from './cleanup-duplicate-integrations-lib.mjs';

loadLocalEnv();

const { db } = await import('@shopkeeper/db');

const execute = process.argv.includes('--execute');
const platformFilter = readValueArg('--platform=');
const externalAccountIdFilter = readValueArg('--external-account-id=');

function readValueArg(prefix) {
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim();
  return raw || null;
}

async function loadIntegrations() {
  const rows = await db.integration.findMany({
    where: {
      ...(platformFilter ? { platform: platformFilter } : {}),
      ...(externalAccountIdFilter ? { externalAccountId: externalAccountIdFilter } : {}),
    },
    select: {
      id: true,
      organizationId: true,
      platform: true,
      externalAccountId: true,
      createdAt: true,
      organization: { select: { name: true } },
    },
    orderBy: [{ platform: 'asc' }, { externalAccountId: 'asc' }, { createdAt: 'desc' }],
  });
  return rows;
}

function groupIntegrations(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = groupKey(row.platform, row.externalAccountId);
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

async function assessDeletion(row) {
  const [replyThreadCount, messageCount, defaultEmailOrg] = await Promise.all([
    db.thread.count({ where: { replyIntegrationId: row.id } }),
    db.message.count({ where: { integrationId: row.id } }),
    db.organization.findFirst({
      where: { defaultEmailIntegrationId: row.id },
      select: { id: true, name: true },
    }),
  ]);

  const blockers = [];
  if (replyThreadCount > 0) blockers.push(`${replyThreadCount} reply thread(s)`);
  if (messageCount > 0) blockers.push(`${messageCount} message(s)`);
  if (defaultEmailOrg) {
    blockers.push(`default email integration for org ${defaultEmailOrg.name ?? defaultEmailOrg.id}`);
  }

  return {
    integrationId: row.id,
    organizationId: row.organizationId,
    organizationName: row.organization.name,
    platform: row.platform,
    externalAccountId: row.externalAccountId,
    createdAt: row.createdAt.toISOString(),
    replyThreadCount,
    messageCount,
    safeToDelete: blockers.length === 0,
    blockers,
  };
}

async function main() {
  const rows = await loadIntegrations();
  const duplicateGroups = groupIntegrations(rows);
  const plan = planDuplicateIntegrationCleanup(duplicateGroups);

  const removalAssessments = await Promise.all(plan.remove.map((row) => assessDeletion(row)));
  const blocked = removalAssessments.filter((entry) => !entry.safeToDelete);
  const deletable = removalAssessments.filter((entry) => entry.safeToDelete);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: execute ? 'execute' : 'dry-run',
    filters: {
      platform: platformFilter,
      externalAccountId: externalAccountIdFilter,
    },
    duplicateGroupCount: duplicateGroups.length,
    keep: plan.keep.map((row) => ({
      integrationId: row.id,
      organizationId: row.organizationId,
      organizationName: row.organization.name,
      platform: row.platform,
      externalAccountId: row.externalAccountId,
      createdAt: row.createdAt.toISOString(),
    })),
    remove: removalAssessments,
    deletableCount: deletable.length,
    blockedCount: blocked.length,
    safeToExecute: blocked.length === 0 && deletable.length > 0,
  };

  console.log(JSON.stringify(report, null, 2));

  if (deletable.length === 0) {
    console.log('[cleanup:duplicate-integrations] nothing to delete.');
    return;
  }

  if (blocked.length > 0) {
    console.error(
      `[cleanup:duplicate-integrations] refusing: ${blocked.length} stale integration(s) still have dependent rows. Resolve blockers or delete manually.`,
    );
    process.exitCode = 1;
    return;
  }

  if (!execute) {
    console.log(
      `[cleanup:duplicate-integrations] dry run — ${deletable.length} stale integration(s) would be deleted. Re-run with --execute to apply.`,
    );
    return;
  }

  const deleted = await db.integration.deleteMany({
    where: { id: { in: deletable.map((entry) => entry.integrationId) } },
  });

  console.log(
    `[cleanup:duplicate-integrations] deleted ${deleted.count} stale integration(s).`,
  );
}

await main();
await db.$disconnect();
