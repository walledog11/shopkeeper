import type { PrismaClient } from '@prisma/client';

type EmailInboundAuditDb = Pick<PrismaClient, 'integration' | 'organization'>;

type EmailInboundMode = 'hybrid' | 'native' | 'postmark';

type GmailInboundStatus =
  | 'active'
  | 'degraded'
  | 'reauthorization_required'
  | (string & {});

export interface EmailIntegrationAuditRow {
  integrationId: string;
  emailProvider: 'gmail' | 'postmark';
  lifecycleStatus: string;
  externalAccountId: string;
  fromEmail: string | null;
  inboundMode: EmailInboundMode | null;
  gmailInboundStatus: GmailInboundStatus | null;
}

export interface DualIntegrationOrgAudit {
  organizationId: string;
  organizationName: string;
  organizationLifecycleStatus: string;
  defaultEmailIntegrationId: string | null;
  postmarkInboundRecipient: string;
  gmail: EmailIntegrationAuditRow | null;
  postmark: EmailIntegrationAuditRow | null;
  /** Same merchant support address on both rows (heuristic for shared INBOX). */
  supportAddressOverlap: boolean;
  /** Both rows active and Gmail native sync is not explicitly disabled. */
  dualDeliveryRisk: boolean;
  /** Operator checklist — not inferred from DB. */
  operatorNotes: {
    postmarkForwardVerifiedActive: 'unknown' | 'yes' | 'no';
    merchantInboxSameAsGmailWatch: 'unknown' | 'yes' | 'no';
  };
}

export interface EmailInboundTransportAuditReport {
  generatedAt: string;
  inboundEmailDomain: string | null;
  productPolicy: string;
  summary: {
    organizationsWithActiveEmail: number;
    forwardOnlyPostmark: number;
    gmailWatchOnly: number;
    dualActiveIntegration: number;
    dualDeliveryRisk: number;
    dualWithSupportAddressOverlap: number;
  };
  dualIntegrationOrgs: DualIntegrationOrgAudit[];
  dualDeliveryRiskOrgs: DualIntegrationOrgAudit[];
  safeToBeginPhase1Ops: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function readInboundMode(metadata: unknown): EmailInboundMode | null {
  if (!isRecord(metadata)) return null;
  const mode = metadata.inboundMode;
  if (mode === 'hybrid' || mode === 'native' || mode === 'postmark') return mode;
  return null;
}

function readGmailInboundStatus(metadata: unknown): GmailInboundStatus | null {
  if (!isRecord(metadata) || !isRecord(metadata.gmail)) return null;
  const status = metadata.gmail.inboundStatus;
  return typeof status === 'string' ? status : null;
}

function toAuditRow(integration: {
  id: string;
  emailProvider: 'gmail' | 'postmark' | null;
  lifecycleStatus: string;
  externalAccountId: string;
  fromEmail: string | null;
  metadata: unknown;
}): EmailIntegrationAuditRow | null {
  if (integration.emailProvider !== 'gmail' && integration.emailProvider !== 'postmark') {
    return null;
  }
  return {
    integrationId: integration.id,
    emailProvider: integration.emailProvider,
    lifecycleStatus: integration.lifecycleStatus,
    externalAccountId: integration.externalAccountId,
    fromEmail: integration.fromEmail,
    inboundMode: readInboundMode(integration.metadata),
    gmailInboundStatus: integration.emailProvider === 'gmail'
      ? readGmailInboundStatus(integration.metadata)
      : null,
  };
}

/** Exported for tests — mirrors gateway gmail-sync eligibility without env flags. */
export function gmailNativeSyncConfigured(row: EmailIntegrationAuditRow | null): boolean {
  if (!row || row.emailProvider !== 'gmail' || row.lifecycleStatus !== 'active') return false;
  if (row.inboundMode === 'postmark') return false;
  const status = row.gmailInboundStatus;
  return status === 'active' || status === 'degraded';
}

function supportAddressesOverlap(
  gmail: EmailIntegrationAuditRow | null,
  postmark: EmailIntegrationAuditRow | null,
): boolean {
  if (!gmail || !postmark) return false;
  const gmailAddresses = new Set(
    [gmail.externalAccountId, gmail.fromEmail].map(normalizeEmail).filter(Boolean),
  );
  const postmarkAddresses = [postmark.externalAccountId, postmark.fromEmail]
    .map(normalizeEmail)
    .filter(Boolean);
  return postmarkAddresses.some((address) => gmailAddresses.has(address));
}

function assessDualOrg(input: {
  organizationId: string;
  organizationName: string;
  organizationLifecycleStatus: string;
  defaultEmailIntegrationId: string | null;
  inboundEmailDomain: string;
  gmail: EmailIntegrationAuditRow | null;
  postmark: EmailIntegrationAuditRow | null;
}): DualIntegrationOrgAudit {
  const gmailActive = input.gmail?.lifecycleStatus === 'active';
  const postmarkActive = input.postmark?.lifecycleStatus === 'active';
  const overlap = supportAddressesOverlap(input.gmail, input.postmark);
  const dualDeliveryRisk = Boolean(
    gmailActive
    && postmarkActive
    && gmailNativeSyncConfigured(input.gmail),
  );

  return {
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    organizationLifecycleStatus: input.organizationLifecycleStatus,
    defaultEmailIntegrationId: input.defaultEmailIntegrationId,
    postmarkInboundRecipient: `${input.organizationId}@${input.inboundEmailDomain}`,
    gmail: input.gmail,
    postmark: input.postmark,
    supportAddressOverlap: overlap,
    dualDeliveryRisk,
    operatorNotes: {
      postmarkForwardVerifiedActive: 'unknown',
      merchantInboxSameAsGmailWatch: overlap ? 'yes' : 'unknown',
    },
  };
}

export interface ComputeEmailInboundTransportAuditOptions {
  inboundEmailDomain?: string;
}

export async function computeEmailInboundTransportAuditReport(
  db: EmailInboundAuditDb,
  options: ComputeEmailInboundTransportAuditOptions = {},
): Promise<EmailInboundTransportAuditReport> {
  const inboundEmailDomain = options.inboundEmailDomain
    ?? process.env.INBOUND_EMAIL_DOMAIN
    ?? null;

  const integrations = await db.integration.findMany({
    where: {
      platform: 'email',
      emailProvider: { in: ['gmail', 'postmark'] },
    },
    select: {
      id: true,
      organizationId: true,
      emailProvider: true,
      lifecycleStatus: true,
      externalAccountId: true,
      fromEmail: true,
      metadata: true,
    },
  });

  const orgIds = [...new Set(integrations.map((row) => row.organizationId))];
  const organizations = orgIds.length === 0
    ? []
    : await db.organization.findMany({
      where: { id: { in: orgIds } },
      select: {
        id: true,
        name: true,
        lifecycleStatus: true,
        defaultEmailIntegrationId: true,
      },
    });
  const orgById = new Map(organizations.map((org) => [org.id, org]));

  const byOrg = new Map<string, { gmail: EmailIntegrationAuditRow | null; postmark: EmailIntegrationAuditRow | null }>();
  for (const integration of integrations) {
    const row = toAuditRow(integration);
    if (!row) continue;
    const bucket = byOrg.get(integration.organizationId) ?? { gmail: null, postmark: null };
    if (row.emailProvider === 'gmail') bucket.gmail = row;
    else bucket.postmark = row;
    byOrg.set(integration.organizationId, bucket);
  }

  let forwardOnlyPostmark = 0;
  let gmailWatchOnly = 0;
  let dualActiveIntegration = 0;
  const dualIntegrationOrgs: DualIntegrationOrgAudit[] = [];

  for (const [organizationId, bucket] of byOrg) {
    const gmailActive = bucket.gmail?.lifecycleStatus === 'active';
    const postmarkActive = bucket.postmark?.lifecycleStatus === 'active';
    if (gmailActive && !postmarkActive) gmailWatchOnly += 1;
    else if (postmarkActive && !gmailActive) forwardOnlyPostmark += 1;
    else if (gmailActive && postmarkActive) {
      dualActiveIntegration += 1;
      const org = orgById.get(organizationId);
      dualIntegrationOrgs.push(assessDualOrg({
        organizationId,
        organizationName: org?.name ?? '(unknown)',
        organizationLifecycleStatus: org?.lifecycleStatus ?? '(unknown)',
        defaultEmailIntegrationId: org?.defaultEmailIntegrationId ?? null,
        inboundEmailDomain: inboundEmailDomain ?? 'inbound.shopkeeper.app',
        gmail: bucket.gmail,
        postmark: bucket.postmark,
      }));
    }
  }

  dualIntegrationOrgs.sort((a, b) => a.organizationName.localeCompare(b.organizationName));
  const dualDeliveryRiskOrgs = dualIntegrationOrgs.filter((org) => org.dualDeliveryRisk);
  const dualWithSupportAddressOverlap = dualIntegrationOrgs.filter((org) => org.supportAddressOverlap).length;

  const organizationsWithActiveEmail = [...byOrg.values()].filter(
    (bucket) => bucket.gmail?.lifecycleStatus === 'active' || bucket.postmark?.lifecycleStatus === 'active',
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    inboundEmailDomain,
    productPolicy:
      'Keep Postmark inbound for forward-only workspaces (no Gmail OAuth). '
      + 'Gmail-connected workspaces use gmail_watch only — no parallel Postmark forward to the same INBOX.',
    summary: {
      organizationsWithActiveEmail,
      forwardOnlyPostmark,
      gmailWatchOnly,
      dualActiveIntegration,
      dualDeliveryRisk: dualDeliveryRiskOrgs.length,
      dualWithSupportAddressOverlap,
    },
    dualIntegrationOrgs,
    dualDeliveryRiskOrgs,
    safeToBeginPhase1Ops: dualDeliveryRiskOrgs.length === 0,
  };
}
