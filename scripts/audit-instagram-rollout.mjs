import { db } from '@shopkeeper/db';

const strict = process.argv.includes('--strict');

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readInstagramMetadata(metadata) {
  if (!isRecord(metadata) || !isRecord(metadata.instagram)) return {};
  return metadata.instagram;
}

function duplicateValues(rows, getValue) {
  const counts = new Map();
  for (const row of rows) {
    const value = getValue(row);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => left.value.localeCompare(right.value));
}

try {
  const rows = await db.integration.findMany({
    where: { platform: 'ig_dm' },
    select: {
      id: true,
      organizationId: true,
      externalAccountId: true,
      fromEmail: true,
      tokenExpiresAt: true,
      metadata: true,
      createdAt: true,
      organization: {
        select: {
          clerkOrgId: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const integrations = rows.map((row) => {
    const instagram = readInstagramMetadata(row.metadata);
    const subscribedFields = Array.isArray(instagram.subscribedFields)
      ? instagram.subscribedFields.filter((field) => typeof field === 'string')
      : [];
    const authModel = typeof instagram.authModel === 'string'
      ? instagram.authModel
      : 'legacy_or_unknown';

    return {
      integrationId: row.id,
      organizationId: row.organizationId,
      clerkOrganizationId: row.organization.clerkOrgId,
      organizationName: row.organization.name,
      externalAccountId: row.externalAccountId,
      displayIdentity: typeof instagram.username === 'string'
        ? instagram.username
        : row.fromEmail,
      authModel,
      messagesSubscriptionRecorded: subscribedFields.includes('messages'),
      tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  });

  const duplicateOrganizations = duplicateValues(rows, (row) => row.organizationId)
    .map(({ value: organizationId, count }) => ({ organizationId, count }));
  const duplicateAccounts = duplicateValues(rows, (row) => row.externalAccountId)
    .map(({ value: externalAccountId, count }) => ({ externalAccountId, count }));
  const legacyIntegrations = integrations.filter(
    (integration) => integration.authModel !== 'instagram_login',
  );
  const blockers = {
    duplicateOrganizations,
    duplicateAccounts,
    legacyIntegrations,
  };

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      totalIntegrations: integrations.length,
      instagramLoginIntegrations: integrations.length - legacyIntegrations.length,
      legacyOrUnknownIntegrations: legacyIntegrations.length,
      duplicateOrganizations: duplicateOrganizations.length,
      duplicateAccounts: duplicateAccounts.length,
    },
    integrations,
    blockers,
  }, null, 2));

  if (
    strict
    && (
      duplicateOrganizations.length > 0
      || duplicateAccounts.length > 0
      || legacyIntegrations.length > 0
    )
  ) {
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
