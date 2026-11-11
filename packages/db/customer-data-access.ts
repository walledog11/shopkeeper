import { userInfo } from 'node:os';
import { db } from './client.js';

/**
 * Shopify's protected customer data requirements ask for a log of access to
 * customer data that is kept and regularly reviewed. Each row is one person or
 * ops script reading one kind of record in one workspace in one hour: the first
 * read in the hour is recorded and repeats (a polled inbox) are skipped. The
 * dashboard routes that show customer data record workspace members
 * (`withOrgRoute`'s `customerData`); ops scripts record themselves
 * (`scriptActor`). The agent's own reads are its actions (AgentAction).
 */
export type CustomerDataResource =
  | 'inbox'
  | 'thread'
  | 'customer'
  | 'search'
  | 'orders'
  | 'shopify_customer'
  | 'attachment'
  | 'export'
  | 'agent_history'
  | 'agent_request'
  | 'pending_plans'
  | 'operator_chat'
  | 'script';

export interface CustomerDataActor {
  type: 'member' | 'script';
  id: string;
}

export const CUSTOMER_DATA_ACCESS_RETENTION_DAYS = 365;

const HOUR_MS = 3_600_000;
// Only an opaque id is kept: a value from a query string could be an email or
// a search.
const OPAQUE_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{1,20})$/i;
const MAX_REMEMBERED = 10_000;

let rememberedHour = 0;
const remembered = new Set<string>();

export async function recordCustomerDataAccess(entry: {
  organizationId: string;
  actor: CustomerDataActor;
  resource: CustomerDataResource;
  resourceId?: string | null;
  now?: Date;
}): Promise<void> {
  const accessedHour = Math.floor((entry.now ?? new Date()).getTime() / HOUR_MS) * HOUR_MS;
  const resourceId = entry.resourceId && OPAQUE_ID.test(entry.resourceId) ? entry.resourceId : '';
  const actorId = entry.actor.id.slice(0, 255);
  const key = [entry.organizationId, actorId, entry.resource, resourceId].join('|');
  if (accessedHour !== rememberedHour) {
    remembered.clear();
    rememberedHour = accessedHour;
  }
  if (remembered.has(key)) return;

  await db.customerDataAccess.createMany({
    data: [{
      organizationId: entry.organizationId,
      actorType: entry.actor.type,
      actorId,
      resource: entry.resource,
      resourceId,
      accessedHour: new Date(accessedHour),
    }],
    skipDuplicates: true,
  });
  if (remembered.size >= MAX_REMEMBERED) remembered.clear();
  remembered.add(key);
}

/** An ops script run against production, named with the local account that ran it. */
export function scriptActor(script: string): CustomerDataActor {
  let account = 'unknown';
  try {
    account = userInfo().username;
  } catch {
    // No local account entry (some containers): the script name still identifies the run.
  }
  return { type: 'script', id: `${script}:${account}` };
}

export async function purgeExpiredCustomerDataAccess(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - CUSTOMER_DATA_ACCESS_RETENTION_DAYS * 24 * HOUR_MS);
  const result = await db.customerDataAccess.deleteMany({ where: { accessedHour: { lt: cutoff } } });
  return result.count;
}
