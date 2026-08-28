import type { Queue } from 'bullmq';
import type { GmailApiClient } from '@shopkeeper/email';
import type { GmailSyncRedis } from '../../lib/gmail-sync-lock.js';
import type { emitOpsAlert } from '../../ops-alerts.js';
import type { InboundJobData } from '../../types.js';
import type { SharedGatewayWorkerOptions } from '../resources.js';

export interface GmailSyncIntegration {
  id: string;
  accessToken: string | null;
  externalAccountId: string;
  emailProvider: 'gmail' | 'postmark' | null;
  fromEmail: string | null;
  metadata: unknown;
  organizationId: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

export interface GmailSyncProcessorDependencies {
  inboundQueue: Queue<InboundJobData>;
  redis: GmailSyncRedis;
  createClient?: (integration: GmailSyncIntegration) => GmailApiClient;
  emitAlert?: typeof emitOpsAlert;
  now?: () => Date;
  recoveryMaxMessages?: number;
}

export interface GmailSyncWorkerRegistrationOptions extends GmailSyncProcessorDependencies {
  workerOptions: SharedGatewayWorkerOptions;
}
